import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';

const app = express();
const port = 3002;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Increased limit for larger payloads

interface CreateInscriptionRequest {
  content: string;
  contentType: string;
  address: string;
  isTestnet: boolean;
  payloadType: 'PLAIN_TEXT' | 'IMAGE';
}

app.post('/api/create-inscription', async (req: express.Request, res: express.Response) => {
  const { content, contentType, address, isTestnet, payloadType }: CreateInscriptionRequest = req.body;
  const network = isTestnet ? 'testnet' : 'mainnet';

  console.log('Received request:', { contentType, address, isTestnet, payloadType });

  try {
    let inscriptionContent: string;
    
    if (payloadType === 'IMAGE') {
      // For images, content should already be a base64 string
      inscriptionContent = content.replace(/^data:image\/\w+;base64,/, '');
    } else {
      // For text, convert to hex
      inscriptionContent = Buffer.from(content).toString('hex');
    }

    // Prepare the inscription request
    const inscriptionRequest = {
      content: inscriptionContent,
      contentType,
      payloadType,
      network,
      address,
    };

    res.json({
      inscriptionRequest,
      message: 'Use this request with sats-connect createInscription method on the client side.',
    });
  } catch (error) {
    console.error('Error preparing inscription request:', error);
    res.status(500).json({ 
      error: 'Failed to prepare inscription request', 
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});