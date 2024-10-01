const { io } = require("socket.io-client");
const fs = require('fs');
const path = require('path');

const SERVER_URL = 'http://localhost:3000';
const CLIENT_ID = 'client3';
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
let currentFile = null; // Store the current file being processed
let isUploadCancelled = false; // Flag to track if the upload was cancelled
let isUploadPaused = false; // Flag to track if the upload is paused
let pendingChunks = []; // Store chunks received during pause

const socket = io(SERVER_URL);

socket.on('connect', () => {
    console.log(`Connected to server as ${CLIENT_ID}`);
    socket.emit('identify', CLIENT_ID);
});

socket.on('message', ({ id, message }) => {
    console.log(`Received message from ${id}: ${message}`);
});

// Handle incoming file chunks
socket.on('file_chunk', handleFileChunk);

// Handle cancellation of file upload
socket.on('cancel_upload', (data) => {
    isUploadPaused = false;
    const { fileName } = data;
    cancelFileUpload(fileName);
    isUploadCancelled = false;

});

// Handle pause of file upload
socket.on('pause_upload', () => {
    isUploadPaused = true;
    console.log("Upload paused.");
});

// Handle resume of file upload
socket.on('resume_upload', () => {
    isUploadPaused = false;
    console.log("Upload resumed.");
    
    // Resume processing any pending chunks
    processPendingChunks();
});

// Handle client disconnection
socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

// Function to handle file chunk received
function handleFileChunk({ chunkData, chunkSequence, isFinalChunk, fileName }) {
    // If upload is cancelled, stop processing
    if (isUploadCancelled) {
        console.log(`Upload was cancelled. Stopping file processing for ${fileName}.`);
        return;
    }

    // If the upload is paused, store the chunk for later processing
    if (isUploadPaused) {
        pendingChunks.push({ chunkData, chunkSequence, isFinalChunk, fileName });
        console.log(`Chunk ${chunkSequence} stored while upload is paused.`);
        return;
    }

    processChunk({ chunkData, chunkSequence, isFinalChunk, fileName });
}

// Function to process individual chunk
function processChunk({ chunkData, chunkSequence, isFinalChunk, fileName }) {
    // Start writing the file if it's the first chunk or a new file
    if (!currentFile || currentFile.name !== fileName) {
        if (currentFile) {
            currentFile.writeStream.end();
        }

        const fileExtension = path.extname(fileName).slice(1).toLowerCase();
        const folderName = getFolderName(fileExtension);
        const folderPath = path.join(DOWNLOADS_DIR, folderName);

        // Create folder if it doesn't exist
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        const filePath = path.join(folderPath, fileName);
        currentFile = {
            name: fileName,
            writeStream: fs.createWriteStream(filePath),
            expectedSequence: 0
        };
    }

    // Process the chunk only if the sequence is correct
    if (chunkSequence === currentFile.expectedSequence) {
        console.log(chunkSequence);
        currentFile.writeStream.write(Buffer.from(chunkData));
        currentFile.expectedSequence++;

        if (isFinalChunk) {
            currentFile.writeStream.end(() => {
                console.log(`File ${fileName} has been successfully assembled and saved.`);
                currentFile = null; // Reset the current file
            });
        }
    } else {
        console.error(`Received out-of-order chunk for ${fileName}. Expected ${currentFile.expectedSequence}, got ${chunkSequence}`);
    }
}

// Function to process pending chunks after resume
function processPendingChunks() {
    while (pendingChunks.length > 0) {
        const chunk = pendingChunks.shift();
        processChunk(chunk);
    }
}

// Function to cancel file upload and clean up
function cancelFileUpload(fileName) {
    const fileExtension = path.extname(fileName).slice(1).toLowerCase();
    const folderName = getFolderName(fileExtension);
    const folderPath = path.join(DOWNLOADS_DIR, folderName, fileName);

    isUploadCancelled = true;

    // Stop any ongoing write operations for this file
    if (currentFile && currentFile.name === fileName) {
        // End the write stream before unlinking the file
        currentFile.writeStream.end(() => {
            // Once stream is closed, delete the partial file
            fs.unlink(folderPath, (err) => {
                if (err) {
                    console.error(`Error deleting partial file: ${err}`);
                } else {
                    console.log(`Partial file ${fileName} deleted successfully`);
                }
            });

            currentFile = null;
        });
    }
}

// Function to get folder name based on file extension
function getFolderName(extension) {
    const folderMap = {
        'mp4': 'videos',
        'avi': 'videos',
        'mov': 'videos',
        'mp3': 'audio',
        'wav': 'audio',
        'jpg': 'images',
        'jpeg': 'images',
        'png': 'images',
        'gif': 'images',
        'pdf': 'documents',
        'doc': 'documents',
        'docx': 'documents',
        'txt': 'documents'
        // Add more mappings as needed
    };

    return folderMap[extension] || 'other';
}

// Ensure the downloads directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}
