# Bitcoin Ordinal Creator - Back-end

## Introduction

This repository contains the back-end code for the Bitcoin Ordinal Creator application. It provides the necessary API endpoints to support the creation and management of Bitcoin Ordinals.

## Features

- API endpoints for creating Ordinal inscriptions
- Support for both Mainnet and Testnet
- Integration with Bitcoin Core for transaction creation and broadcasting
- UTXO management for Ordinal creation

## Technologies Used

- Node.js
- Express.js
- TypeScript
- bitcoinjs-lib
- axios (for external API calls)

## Prerequisites

Before you begin, ensure you have met the following requirements:

- Node.js (v14.0.0 or later)
- npm (v6.0.0 or later)
- Bitcoin Core node (for transaction broadcasting)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/bitcoin-ordinal-creator-backend.git
   ```

2. Navigate to the project directory:
   ```
   cd bitcoin-ordinal-creator-backend
   ```

3. Install the dependencies:
   ```
   npm install
   ```

4. Create a `.env` file in the root directory and add the following configurations:
   ```
   PORT=3002
   BITCOIN_RPC_URL=http://localhost:8332
   BITCOIN_RPC_USER=your_rpc_username
   BITCOIN_RPC_PASS=your_rpc_password
   ```

## Usage

1. Start the server:
   ```
   npm start
   ```

2. The server will start running on `http://localhost:3002` (or the port specified in your .env file)

## API Documentation

### Create Inscription

- **URL**: `/api/create-inscription`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "content": "string",
    "contentType": "string",
    "address": "string",
    "isTestnet": boolean
  }
  ```
- **Response**:
  ```json
  {
    "inscriptionRequest": {
      // Inscription request details
    }
  }
  ```

### Broadcast Transaction

- **URL**: `/api/broadcast-tx`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "signedTx": "string",
    "isTestnet": boolean
  }
  ```
- **Response**:
  ```json
  {
    "txid": "string"
  }
  ```

## Configuration

- The server port, Bitcoin RPC URL, and credentials can be configured in the `.env` file.
- To switch between Testnet and Mainnet, use the `isTestnet` parameter in the API requests.

## Contributing

Contributions to the Bitcoin Ordinal Creator back-end are welcome. Please follow these steps to contribute:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature-name`)
3. Make your changes
4. Commit your changes (`git commit -am 'Add some feature'`)
5. Push to the branch (`git push origin feature/your-feature-name`)
6. Create a new Pull Request

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

## Contact

If you have any questions or feedback, please open an issue on GitHub or contact the maintainer at brianchoffman@gmail.com.
