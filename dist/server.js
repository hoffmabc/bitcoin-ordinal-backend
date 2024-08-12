"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
const ecc = __importStar(require("tiny-secp256k1"));
const ecpair_1 = require("ecpair");
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const axios_1 = __importDefault(require("axios"));
(0, bitcoinjs_lib_1.initEccLib)(ecc);
const ECPair = (0, ecpair_1.ECPairFactory)(ecc);
const app = (0, express_1.default)();
const port = 3002;
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json({ limit: '10mb' }));
app.post('/api/prepare-ordinal-tx', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { content, fileType, fileData, address, isTestnet } = req.body;
    const network = isTestnet ? bitcoinjs_lib_1.networks.testnet : bitcoinjs_lib_1.networks.bitcoin;
    const apiUrl = isTestnet ? 'https://blockstream.info/testnet/api' : 'https://blockstream.info/api';
    console.log('Received request:', { content, fileType, address, isTestnet });
    try {
        const inscriptionData = createInscriptionData(content, fileType, fileData);
        console.log('Inscription data created');
        const psbt = yield createOrdinalPsbt(inscriptionData, address, network, apiUrl);
        console.log('PSBT created');
        const psbtBase64 = psbt.toBase64();
        console.log('PSBT converted to Base64');
        // Get the input indexes
        const inputIndexes = psbt.data.inputs.map((_, index) => index);
        console.log('Input indexes:', inputIndexes);
        res.json({
            psbt: psbtBase64,
            inputIndexes: inputIndexes
        });
    }
    catch (error) {
        console.error('Error preparing ordinal transaction:', error);
        res.status(500).json({
            error: 'Failed to prepare ordinal transaction',
            details: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
        });
    }
}));
function createInscriptionData(content, fileType, fileData) {
    let inscriptionContent;
    if (fileData) {
        // If file data is provided, use it as the inscription content
        inscriptionContent = `data:${fileType};base64,${fileData}`;
    }
    else {
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
function createOrdinalPsbt(inscriptionData, address, network, apiUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const psbt = new bitcoinjs_lib_1.Psbt({ network });
        console.log('Psbt instance created', psbt);
        try {
            const utxos = yield fetchUtxos(address, apiUrl);
            if (utxos.length === 0) {
                throw new Error('No UTXOs available');
            }
            console.log('UTXOs:', JSON.stringify(utxos, null, 2));
            const isTaproot = address.startsWith('tb1p') || address.startsWith('bc1p');
            let totalInput = 0;
            for (const [index, utxo] of utxos.entries()) {
                console.log(`Processing UTXO at index ${index}:`, JSON.stringify(utxo, null, 2));
                if (!utxo.txid || utxo.vout === undefined || utxo.value === undefined) {
                    console.error(`Invalid UTXO at index ${index}:`, JSON.stringify(utxo, null, 2));
                    throw new Error(`Invalid UTXO data at index ${index}`);
                }
                try {
                    let script;
                    if (utxo.scriptpubkey) {
                        script = Buffer.from(utxo.scriptpubkey, 'hex');
                    }
                    else {
                        script = bitcoinjs_lib_1.address.toOutputScript(address, network);
                    }
                    let inputData = {
                        hash: utxo.txid,
                        index: utxo.vout,
                        witnessUtxo: {
                            script: script,
                            value: utxo.value,
                        },
                    };
                    if (isTaproot) {
                        inputData = {
                            hash: utxo.txid,
                            index: utxo.vout,
                            witnessUtxo: {
                                script: script, // Script can be derived as before
                                value: utxo.value,
                            },
                        };
                    }
                    psbt.addInput(inputData);
                    totalInput += utxo.value;
                }
                catch (error) {
                    console.error(`Error adding input at index ${index}:`, error);
                    throw error;
                }
            }
            // const ordinalScript = bscript.compile([
            //   bscript.OPS.OP_FALSE,
            //   bscript.OPS.OP_IF,
            //   Buffer.from('ord'),
            //   bscript.OPS.OP_1,
            //   Buffer.from('text/plain;charset=utf-8'),
            //   bscript.OPS.OP_0,
            //   Buffer.from(''), //inscriptionData,
            //   bscript.OPS.OP_ENDIF
            // ]);
            // console.log('Ordinal Script:', ordinalScript.toString('hex'));
            // psbt.addOutput({
            //   script: ordinalScript,
            //   value: 546,
            // });
            // console.log('Outputs after adding ordinal script:', JSON.stringify(psbt.data.outputs, null, 2));
            // console log the outputs
            console.log('Inputs:', JSON.stringify(psbt.data.inputs, null, 2));
            // Estimate the fee (using a fixed size estimation)
            const estimatedSize = 200 + (psbt.data.inputs.length * 100) + (psbt.data.outputs.length * 50);
            const feeRate = yield getFeeRate(apiUrl); // sats/vbyte
            const fee = estimatedSize * feeRate;
            // Add change output
            const changeAmount = totalInput - 546 - fee;
            if (changeAmount > 546) {
                psbt.addOutput({
                    address: address,
                    value: changeAmount,
                });
            }
            psbt.addOutputs([
                {
                    script: bitcoinjs_lib_1.script.compile([
                        bitcoinjs_lib_1.script.OPS.OP_FALSE,
                        bitcoinjs_lib_1.script.OPS.OP_IF,
                        Buffer.from('ord'),
                        bitcoinjs_lib_1.script.OPS.OP_1,
                        Buffer.from('text/plain;charset=utf-8'),
                        bitcoinjs_lib_1.script.OPS.OP_0,
                        inscriptionData,
                        bitcoinjs_lib_1.script.OPS.OP_ENDIF
                    ]),
                    value: 546,
                },
            ]);
            console.log('Outputs:', JSON.stringify(psbt, null, 2));
            const psbtBase64 = psbt.toBase64();
            console.log('PSBT size (bytes):', psbtBase64.length);
            console.log('PSBT base64:', psbtBase64);
            return psbt;
        }
        catch (error) {
            console.error('Error in createOrdinalPsbt:', error);
            throw error;
        }
    });
}
function fetchUtxos(address, apiUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield axios_1.default.get(`${apiUrl}/address/${address}/utxo`);
            return response.data;
        }
        catch (error) {
            console.error('Error fetching UTXOs:', error);
            throw error;
        }
    });
}
function getFeeRate(apiUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield axios_1.default.get(`${apiUrl}/fee-estimates`);
            return response.data['2'] || 1; // Use 2-block target fee rate, default to 1 sat/vbyte if not available
        }
        catch (error) {
            console.error('Error fetching fee rate:', error);
            return 1; // Default to 1 sat/vbyte if there's an error
        }
    });
}
app.post('/api/broadcast-tx', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { signedTx, isTestnet } = req.body;
    const apiUrl = isTestnet ? 'https://blockstream.info/testnet/api' : 'https://blockstream.info/api';
    try {
        const response = yield axios_1.default.post(`${apiUrl}/tx`, signedTx);
        res.json({ txid: response.data });
    }
    catch (error) {
        console.error('Error broadcasting transaction:', error);
        res.status(500).json({ error: 'Failed to broadcast transaction' });
    }
}));
app.post('/api/create-ordinal', (req, res) => {
    const { content, fileType, fileData } = req.body;
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
