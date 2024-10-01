import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './FileUpload.css';
const clients = ['client1', 'client2', 'client3']

// Socket initialization inside the component
export const FileUpload = () => {
  const [socket, setSocket] = useState(null);
  const [onlineClients, setOnlineClients] = useState({});
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [uploadPaused, setUploadPaused] = useState(false);
  const [currentUpload, setCurrentUpload] = useState(null);
  const [isSendingChunk, setIsSendingChunk] = useState(false);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [clientUploadState, setClientUploadState] = useState({});
  const [selectedClients, setSelectedClients] = useState({});

  
  const fileInputRef = useRef(null);

  // Initialize socket only once
  useEffect(() => {
    const newSocket = io('http://localhost:3000');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      newSocket.emit('identify', 'master');
    });

    newSocket.on('bulk_status', (statusUpdates) => {
      setOnlineClients(prevClients => {
        const newClients = { ...prevClients };
        statusUpdates.forEach(update => {
          newClients[update.clientId] = update.status;
        });
        return newClients;
      });
    });

    // Cleanup socket connection on unmount to prevent multiple listeners
    return () => {
      newSocket.off('connect');
      newSocket.off('bulk_status');
      newSocket.close();
    };
  }, []);

  const handleClientSelection = (clientId, isChecked) => {
    setSelectedClients(prevState => ({
      ...prevState,
      [clientId]: isChecked
    }));
  };
  
    // Get selected clients from the state
    const getSelectedClients = () => {
        return Object.keys(selectedClients).filter(clientId => selectedClients[clientId]);
        
      };
    

  const handleSendMessage = (event) => {
    event.preventDefault();
    const selectedClients = getSelectedClients();
    if (message && selectedClients.length > 0) {
      socket.emit('send-message', { message, clients: selectedClients });
      setMessage('');
    } else {
      alert('Please enter a message and select at least one client.');
    }
  };

  const handleUploadFile = (event) => {
    event.preventDefault();
    const file = fileInputRef.current.files[0];
    if (file) {
      setUploadInProgress(true);
      setUploadPaused(false);
      const selectedClients = getSelectedClients();
      console.log(selectedClients)
      const chunkSize = 64 * 1024; // 64KB chunks

      // Initialize the client upload state (pause, resume, cancel)
      const uploadState = selectedClients.reduce((state, clientId) => {
        state[clientId] = { upload: false,paused: false, canceled: false, offset: 0, checkSequence: 0, progress: 0 }; // State per client
        return state;
      }, {});

      setClientUploadState(uploadState); // Set state for all selected clients
 
      setCurrentUpload({ file, selectedClients, chunkSize, offset: 0, chunkSequence: 0 });
    } else {
      console.log('No file selected');
    }
  };

  // Monitor currentUpload and handle sending chunks
  useEffect(() => {
    if (currentUpload && !uploadPaused && !isSendingChunk) {
      sendChunk();
    }
  }, [currentUpload, uploadPaused, isSendingChunk]);

  const sendChunk = () => {
    if (!currentUpload || uploadPaused || isSendingChunk) return;

    setIsSendingChunk(true);

    const { file, selectedClients, chunkSize, offset, chunkSequence } = currentUpload;
    if (offset > file.size) {
      console.error("Offset exceeds file size.");
      setIsSendingChunk(false);
      return;
    }

    const chunk = file.slice(offset, offset + chunkSize);
    const reader = new FileReader();

    reader.onload = function (e) {
      const chunkData = new Uint8Array(e.target.result);
      const isFinalChunk = offset + chunkSize >= file.size;

      selectedClients.forEach(clientId => {
            // const clientState = clientUploadState[clientId];
            const clientState = clientUploadState[clientId];

            
        
            // Only send chunk if client is not  canceled
            
            if(!clientState.canceled){
                clientState.upload = true;
                socket.emit('file_chunk', {
                targetClientId: clientId,
                chunkData,
                chunkSequence,
                isFinalChunk,
                fileName: file.name
                }, (response) => {
                if (!response?.success) {
                    console.error('Failed to send chunk:', response?.error || 'Unknown error');
                }
                });
            }

            updateProgressBars();

        
      });

    
      setCurrentUpload(prev => {
        if (!prev) {
          setIsSendingChunk(false);
          return null;
        }

        const newOffset = prev.offset + chunkSize;
        const newChunkSequence = prev.chunkSequence + 1;

        setIsSendingChunk(false);

        if (isFinalChunk) {
            console.log('Final chunk sent. Completing upload.');
            uploadComplete();

            return null;
        }

        return {
          ...prev,
          offset: newOffset,
          chunkSequence: newChunkSequence
        };
      });
    };

    reader.onerror = function (error) {
      console.error('Error reading chunk:', error);
      setIsSendingChunk(false);
    };

    reader.readAsArrayBuffer(chunk);
  };

  const uploadComplete = () => {
    // Mark the upload as complete for active clients
    setUploadInProgress(false);
    currentUpload.selectedClients.forEach(clientId => {
        // const clientState = clientUploadState[clientId];
        const clientState = clientUploadState[clientId];
        clientState.upload = false;
        if(clientState.paused){socket.emit('cancel_upload', {clientId,fileName:currentUpload.file.name} );
        console.log(`Cancel upload emitted for ${clientId}`);}
    });
    
    
    
    resetProgressBars();
};


  let alertShown = false; // Ensure alert is shown only once

 const handlePauseUpload = (clientId) => {
    setClientUploadState(prev => ({
      ...prev,
      [clientId]: { ...prev[clientId], paused: true, offset: currentUpload.offset  }
    
    }));

    socket.emit('pause_upload', clientId);

    console.log(`Paused upload for client: ${clientId}`);
  };
  
  const handleResumeUpload = (clientId) => {
    setClientUploadState(prev => ({
      ...prev,
      [clientId]: { ...prev[clientId], paused: false }
    }));
    sendChunk();
    socket.emit('resume_upload', clientId );
    console.log(`Resumed upload for client: ${clientId}`);
  };
  
  const handleCancelUpload = (clientId) => {
    
    setClientUploadState(prev => ({
      ...prev,
      [clientId]: { ...prev[clientId], canceled: true, progress: 0, upload: false }
    }));
    socket.emit('cancel_upload', {clientId,fileName:currentUpload.file.name} );
    console.log(`Cancelled upload for client: ${clientId} for ${currentUpload.file.name}`);
  };
  
  const updateProgressBars = () => {
    if (!currentUpload) return;

    const { file, offset } = currentUpload;

    currentUpload.selectedClients.forEach(clientId => {
    const progress = Math.min(100, Math.round((offset / file.size) * 100));

    const progressBar = document.getElementById(`progress-${clientId}`);
    if (progressBar && !clientUploadState[clientId].canceled && !clientUploadState[clientId].paused) {
        progressBar.value = progress;
        setClientUploadState(prev => ({
          ...prev,
          [clientId]: { ...prev[clientId], progress }
        }));
      }
    });
  };

  const resetProgressBars = () => {
    currentUpload?.selectedClients.forEach(clientId => {
      const progressBar = document.getElementById(`progress-${clientId}`);
      if (progressBar) {
        progressBar.value = 0;
      }
    });
  };

  const filteredClients = clients.filter(clientId =>
    clientId.toLowerCase().includes(searchQuery.toLowerCase())
  );


  return (
    <div>
      <h1>File Upload and Client Management</h1>
  
      {/* Send Message Section */}
      <div id="container">
        {/* Client Options Section */}
        <div id="container"><h2>Select Client Options</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search clients..."
        />
        <div id="client-options">
          {filteredClients.map((clientId) => (
            <div key={clientId} className="client-container">
              <input
                type="checkbox"
                id={clientId}
                checked={selectedClients[clientId] || false}
                onChange={(e) => handleClientSelection(clientId, e.target.checked)}
                disabled={!onlineClients[clientId]}
              />
              <label htmlFor={clientId}>
                {clientId} ({onlineClients[clientId] ? 'Online' : 'Offline'})
              </label>
  
              <progress id={`progress-${clientId}`} value={0} max={100} />
              
              <div className="button-group">
             
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter your message"
              />
        
                         
  
                {/* Pause/Resume Button Logic */}
                {!clientUploadState[clientId]?.paused &&
                  !clientUploadState[clientId]?.canceled && (
                    <button
                      type="button"
                      onClick={() => handlePauseUpload(clientId)}
                      disabled={clientUploadState[clientId]?.canceled || !clientUploadState[clientId]?.upload}
                     
                    >
                      Pause
                    </button>
                  )}
                {clientUploadState[clientId]?.paused && 
                  !clientUploadState[clientId]?.canceled && (
                  <button
                    type="button"
                    onClick={() => handleResumeUpload(clientId)}
                    disabled={clientUploadState[clientId]?.canceled || !clientUploadState[clientId]?.upload}
                  >
                    Resume
                  </button>
                )}
                
  
                {/* Cancel Button */}
                <button
                  type="button"
                  onClick={() => handleCancelUpload(clientId)}
                  disabled={clientUploadState[clientId]?.canceled || !clientUploadState[clientId]?.upload }
                >
                  Cancel
                </button>
              </div>
             
            </div>
            
          ))}
        </div></div>
        
  
        {/* File Upload Section */}
        <h2>Upload File</h2>
        <form onSubmit={handleUploadFile}>
          <input type="file" ref={fileInputRef} />
          <div className="button-group">
            <button
              type="submit"
              disabled={!(getSelectedClients().length )|| currentUpload}
            >
              Upload
            </button>
          </div>
        </form>

        <form onSubmit={handleSendMessage}>
          <div className="button-group">
            <button type="submit">Send Message</button>
          </div>
        </form>

      </div>
    </div>
  );
  
};
