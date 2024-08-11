import express from 'express';
import { Network, Psbt, payments, address as bitcoinAddress, initEccLib, networks } from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';

initEccLib(ecc);

const ECPair = ECPairFactory(ecc);

const app = express();
const port = 3002;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

interface PrepareOrdinalTxRequest {
  content: string;
  fileType: string;
  fileData: string | null;
  address: string;
  isTestnet: boolean;
}

interface UTXO {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
  value: number;
  scriptpubkey?: string;
}

app.post('/api/prepare-ordinal-tx', async (req: express.Request, res: express.Response) => {
  interface PrepareOrdinalTxRequest {
    content: string;
    fileType: string;
    fileData: string | null;
    address: string;
    isTestnet: boolean;
  }

  const { content, fileType, fileData, address, isTestnet } = req.body as PrepareOrdinalTxRequest;
  const network = isTestnet ? networks.testnet : networks.bitcoin;
  const apiUrl = isTestnet ? 'https://blockstream.info/testnet/api' : 'https://blockstream.info/api';

  console.log('Received request:', { content, fileType, address, isTestnet });

  try {
    const inscriptionData = createInscriptionData(content, fileType, fileData);
    console.log('Inscription data created');

    const psbt = await createOrdinalPsbt(inscriptionData, address, network, apiUrl);
    console.log('PSBT created');

    const psbtBase64 = psbt.toBase64();
    console.log('PSBT converted to Base64');

    res.json({ psbt: psbtBase64 });
  } catch (error) {
    console.error('Error preparing ordinal transaction:', error);
    res.status(500).json({ 
      error: 'Failed to prepare ordinal transaction', 
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    });
  }
});

function createInscriptionData(content: string, fileType: string, fileData: string | null): Buffer {
  let inscriptionContent: string;

  if (fileData) {
    // If file data is provided, use it as the inscription content
    inscriptionContent = `data:${fileType};base64,${fileData}`;
  } else {
    // If no file data, use the text content
    inscriptionContent = content;
  }

  // Create the inscription envelope
  const envelope = `
    OP_FALSE
    OP_IF
      OP_PUSH "ord"
      OP_PUSH "01"
      OP_PUSH "${fileType}"
      OP_PUSH "0"
      OP_PUSH "${inscriptionContent}"
    OP_ENDIF
  `.replace(/\s+/g, ' ').trim();

  return Buffer.from(envelope, 'utf8');
}

async function createOrdinalPsbt(inscriptionData: Buffer, address: string, network: Network, apiUrl: string): Promise<Psbt> {
  const psbt = new Psbt({ network });

  try {
    const utxos = await fetchUtxos(address, apiUrl);

    if (utxos.length === 0) {
      throw new Error('No UTXOs available');
    }

    console.log('UTXOs:', JSON.stringify(utxos, null, 2));

    let totalInput = 0;
    utxos.forEach((utxo: { txid: any; vout: undefined; value: number | undefined; scriptpubkey: WithImplicitCoercion<string> | { [Symbol.toPrimitive](hint: "string"): string; }; }, index: any) => {
      console.log(`Processing UTXO at index ${index}:`, JSON.stringify(utxo, null, 2));

      if (!utxo.txid || utxo.vout === undefined || utxo.value === undefined) {
        console.error(`Invalid UTXO at index ${index}:`, JSON.stringify(utxo, null, 2));
        throw new Error(`Invalid UTXO data at index ${index}`);
      }

      try {
        let script: Buffer;
        if (utxo.scriptpubkey) {
          script = Buffer.from(utxo.scriptpubkey, 'hex');
        } else {
          // Derive scriptpubkey from the address
          script = bitcoinAddress.toOutputScript(address, network);
        }

        // For P2TR inputs, we need to provide the internal key
        const inputData: any = {
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: script,
            value: utxo.value,
          },
        };

        if (address.startsWith('tb1p') || address.startsWith('bc1p')) {
          // This is a P2TR address
          const { internalPubkey } = payments.p2tr({ address, network });
          if (internalPubkey) {
            inputData.tapInternalKey = internalPubkey;
          }
        }

        psbt.addInput(inputData);
        totalInput += utxo.value;
      } catch (error) {
        console.error(`Error adding input at index ${index}:`, error);
        throw error;
      }
    });

    // Add the ordinal output (546 satoshis is the dust limit)
    psbt.addOutput({
      script: payments.embed({ data: [inscriptionData] }).output!,
      value: 546,
    });

    // Estimate the fee (using a fixed size estimation)
    const estimatedSize = 200 + (psbt.data.inputs.length * 100) + (psbt.data.outputs.length * 50);
    const feeRate = await getFeeRate(apiUrl); // sats/vbyte
    const fee = estimatedSize * feeRate;

    // Add change output
    const changeAmount = totalInput - 546 - fee;
    if (changeAmount > 546) {
      psbt.addOutput({
        address: address,
        value: changeAmount,
      });
    }

    return psbt;
  } catch (error) {
    console.error('Error in createOrdinalPsbt:', error);
    throw error;
  }
}

async function fetchUtxos(address: string, apiUrl: string) {
  try {
    const response = await axios.get(`${apiUrl}/address/${address}/utxo`);
    console.log('UTXO response:', response.data); // Log the response for debugging
    return response.data;
  } catch (error) {
    console.error('Error fetching UTXOs:', error);
    throw error;
  }
}

async function getFeeRate(apiUrl: string): Promise<number> {
  try {
    const response = await axios.get<Record<string, number>>(`${apiUrl}/fee-estimates`);
    return response.data['2'] || 1; // Use 2-block target fee rate, default to 1 sat/vbyte if not available
  } catch (error) {
    console.error('Error fetching fee rate:', error);
    return 1; // Default to 1 sat/vbyte if there's an error
  }
}

app.post('/api/broadcast-tx', async (req, res) => {
  const { signedTx, isTestnet } = req.body;

  const apiUrl = isTestnet ? 'https://blockstream.info/testnet/api' : 'https://blockstream.info/api';

  try {
    const response = await axios.post(`${apiUrl}/tx`, signedTx);
    res.json({ txid: response.data });
  } catch (error) {
    console.error('Error broadcasting transaction:', error);
    res.status(500).json({ error: 'Failed to broadcast transaction' });
  }
});

app.post('/api/create-ordinal', (req, res) => {
  const { content, fileType, fileData }: PrepareOrdinalTxRequest = req.body;

  // Simulate ordinal creation process
  console.log('Creating ordinal with content:', content);
  console.log('File type:', fileType);
  console.log('File data length:', fileData ? fileData.length : 'No file');

  // In a real implementation, you would:
  // 1. Generate or use an existing Bitcoin wallet
  // 2. Create a Bitcoin transaction with the ordinal data
  // 3. Sign the transaction
  // 4. Broadcast the transaction to the Bitcoin network

  // For now, we'll just simulate the process
  const simulatedOrdinalId = Math.random().toString(36).substr(2, 9);

  // Simulate some blockchain interaction
  setTimeout(() => {
    res.json({
      id: simulatedOrdinalId,
      content,
      fileType,
      status: 'created',
      timestamp: new Date().toISOString()
    });
  }, 2000); // Simulate a 2-second process
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
