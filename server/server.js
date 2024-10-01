const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');

// Initialize the Express app and create an HTTP server
const app = express();
const server = http.createServer(app);

// Setup Socket.IO with CORS enabled for all origins
const io = socketIO(server, {
    cors: {
        origin: "*", // Allow requests from any origin
        methods: ["GET", "POST"]// Allow GET and POST methods
    },
    transports: ['websocket', 'polling'], // WebSocket preferred over polling

});

// Set the port for the server
const PORT = process.env.PORT || 3000;
// Define allowed clients and store them in a Map
const ALLOWED_CLIENTS = ['client1', 'client2', 'client3'];
const CLIENTS = new Map();

// Client class to handle client connections and status
class Client {
    constructor(clientId) {
        this.clientId = clientId;
        this.socket = null;
        this.online = false;
    }

    setSocket(socket) {
        this.socket = socket;
        this.online = true;
    }

    disconnect() {
        this.socket = null;
        this.online = false;
    }
}


// Initialize clients based on allowed client IDs
ALLOWED_CLIENTS.forEach(clientId => CLIENTS.set(clientId, new Client(clientId)));

//app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'webpage.html'));
});

io.on('connection', (socket) => {
    socket.on('identify', (clientId) => {
        if (CLIENTS.has(clientId)) {
            const client = CLIENTS.get(clientId)
            if (!client.socket) {
            client.setSocket(socket);
            socket.clientId = clientId;
            io.emit('status', { clientId, status: true });
            console.log(`${clientId} connected.`);}else{
                console.log(`${clientId} already exists.`);
                socket.disconnect();
            }
        } else if (clientId === 'master') {
            console.log('webpage conected')
            handleMasterConnection(socket);
        } else {
            socket.disconnect();
        }
    });

    socket.on('disconnect', () => {
        if (socket.clientId && CLIENTS.has(socket.clientId)) {
            const client = CLIENTS.get(socket.clientId);
            client.disconnect();
            io.emit('status', { clientId: socket.clientId, status: false });
            console.log(`${socket.clientId} disconnected`);
        }
    });
});

function handleMasterConnection(socket) {
    socket.on('send-message', ({ clients, message }) => {
        clients.forEach(clientId => {
           // console.log(`sending message to ${clientId}`)
            const client = CLIENTS.get(clientId);
            if (client && client.socket) {
                console.log(`sending message to ${clientId}`)
                client.socket.emit('message', { id: 'master', message });
            }
        });
    });

    socket.on('file_chunk', (data) => {
        const { targetClientId, chunkData, chunkSequence, isFinalChunk, fileName } = data;
        const client = CLIENTS.get(targetClientId);
        if (client && client.socket) {
            client.socket.emit('file_chunk', { chunkData, chunkSequence, isFinalChunk, fileName });
            console.log(`Sent chunk ${chunkSequence} of file ${fileName} to ${client.clientId}`);
             // Send acknowledgment back to the client
            socket.emit('chunk_received', {
                chunkSequence: data.chunkSequence,
                fileName: data.fileName
            });
        } else {
            console.error(`Client ${targetClientId} not found or offline`);
        }
    });
    

    socket.on('pause_upload', (targetClientId) => {
        const client = CLIENTS.get(targetClientId);
        console.log('Upload paused by master for ' + targetClientId);
       client.socket.emit(`pause_upload`); // Notify all clients to pause upload
    });

    socket.on('resume_upload', (targetClientId) => {
        const client = CLIENTS.get(targetClientId);
        console.log('Upload resumed by master');
        client.socket.emit(`resume_upload`); // Notify all clients to resume upload
    });

    socket.on('cancel_upload', (data) => {
       const { clientId, fileName } = data;
        const client = CLIENTS.get(clientId);
        if (client && client.socket) {
           client.socket.emit('cancel_upload', { fileName });
            console.log(`Upload cancelled for file ${fileName}`);
        } else {
            console.error(`Client ${data.clientId} not found or offline`);
        }
    });
}

setInterval(() => {
    const statusUpdates = Array.from(CLIENTS.entries()).map(([clientId, client]) => ({
        clientId,
        status: client.online
    }));
    io.emit('bulk_status', statusUpdates);
}, 5000);

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});
