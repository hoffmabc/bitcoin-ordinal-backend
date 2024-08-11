import express from 'express';
import { Psbt, networks, payments } from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';

const ECPair = ECPairFactory(ecc);

const app = express();
const port = 3002;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

interface OrdinalRequest {
  content: string;
  fileType: string;
  fileData: string | null;
}

app.post('/api/prepare-ordinal-tx', async (req, res) => {
  const { content, fileType, fileData, address, isTestnet } = req.body;

  const network = isTestnet ? networks.testnet : networks.bitcoin;
  const apiUrl = isTestnet ? 'https://blockstream.info/testnet/api' : 'https://blockstream.info/api';

  try {
    const inscriptionData = createInscriptionData(content, fileType, fileData);
    const psbt = await createOrdinalPsbt(inscriptionData, address);
    const psbtBase64 = psbt.toBase64();
    res.json({ psbt: psbtBase64 });
  } catch (error) {
    console.error('Error preparing ordinal transaction:', error);
    res.status(500).json({ error: 'Failed to prepare ordinal transaction' });
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

async function createOrdinalPsbt(inscriptionData: Buffer, address: string): Promise<Psbt> {
  const network = networks.bitcoin; // Use mainnet
  const psbt = new Psbt({ network });

  // Fetch UTXOs for the given address
  const utxos = await fetchUtxos(address);

  if (utxos.length === 0) {
    throw new Error('No UTXOs available');
  }

  let totalInput = 0;
  utxos.forEach((utxo: { txid: any; vout: any; scriptPubKey: WithImplicitCoercion<string> | { [Symbol.toPrimitive](hint: "string"): string; }; value: number; }) => {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: Buffer.from(utxo.scriptPubKey, 'hex'),
        value: utxo.value,
      },
    });
    totalInput += utxo.value;
  });

  // Add the ordinal output (546 satoshis is the dust limit)
  psbt.addOutput({
    script: payments.embed({ data: [inscriptionData] }).output!,
    value: 546,
  });

  // Estimate the fee (this is a simplified estimation)
  const estimatedSize = psbt.extractTransaction().virtualSize() + 100; // Add some buffer
  const feeRate = await getFeeRate(); // sats/vbyte
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
}



async function fetchUtxos(address: string) {
  console.log('Fetching UTXOs for address:', address);
  try {
    const response = await axios.get(`https://blockstream.info/api/address/${address}/utxo`);
    console.log('UTXOs fetched:', response.data);
    if (response.data.length === 0) {
      console.log('No UTXOs found for this address. Balance might be 0.');
    }
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error fetching UTXOs:', (error as any).response ? (error as any).response.data : error.message);
    } else {
      console.error('Unknown error occurred while fetching UTXOs');
    }
    throw error;
  }
}

async function getFeeRate() {
  // Fetch current fee rate from a Bitcoin API. This is a placeholder.
  const response = await axios.get('https://blockstream.info/api/fee-estimates');
  return response.data['2']; // Use 2-block target fee rate
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
  const { content, fileType, fileData }: OrdinalRequest = req.body;

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
