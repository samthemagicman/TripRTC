
/**TODO:
 * Events for when a peer disconnects or errors. Then, remove the peer from the room connections list
 * Disconnect individual peers from sockets, and disconnect event once
 */

var config = {
    "host": 'localhost', // The server we're connecting to
    "port": 9090 // The port of the server we're connecting to
}

const url = 'http://localhost:9090';

var simplePeerConfig = {
    objectMode: true,
    trickle: true,
    config: {
        "iceServers": [
            {
                "url": "stun:stun.l.google.com:19302"
            },
            {
                "url": "stun:138.128.241.13:3478"
            },{
                "url": "stun:138.128.241.13:3478?transport=udp"
            },
            {
                "url": "stun:138.128.241.13:3478?transport=tcp"
            },
            {
                "url": "turn:138.128.241.13:3478?transport=udp",
                "username": "root",
                "credential": "password"
            },
            {
                "url": "turn:138.128.241.13:3478?transport=tcp",
                "username": "root",
                "credential": "password"
            },
            {
                "url": "turn:138.128.241.13:5349",
                "username": "root",
                "credential": "password"
            }
        ]
    }
}

/**
 * Creates a WebSocket request/response
 *
 * @param {WebSocket} socket The socket being used
 * @param {String} req The message request to the server (e.g. new-connection)
 * @param {Object} data (optional) Extra data to pass to the server
 * @returns Promise
 */
function websocketRequest(socket, req, data) {
    data = data || {};
    data.type = req;
    return new Promise((resolve, reject) => {
        socket.send(JSON.stringify(data))
        
        const timeout = setTimeout(function () {
            reject('Connection timed out');
            socket.removeEventListener('message', onMessage);
        }, 30000)

        const onMessage = function(msg) {
            var data;
            try {
                data = JSON.parse(msg.data);
            } catch (e) {
                console.log("Invalid JSON from server", data);
                data = {};
            }

            if (data.type == (req + '-response')) {
                clearTimeout(timeout);
                if (data.error) {
                    reject(data.error);
                    return;
                }
                resolve(data);
                socket.removeEventListener('message', onMessage);
            }
        }

        socket.addEventListener('message', onMessage);
    })
}


/**
 * An event object for objects to inherit
 *
 * @class Event
 */
class Event {
    constructor() {
        this._events = {}
        this.fireEvent = (eventName, data) => { //A method to fire the events
            if (!this._events[eventName]) {
                console.error(eventName, "does not exist")
                return;
            }
            this._events[eventName].forEach((method) => method(data))
        }
    }

    on = (eventName, eventMethod) => {
        if (this._events[eventName]) {
            this._events[eventName].push(eventMethod);
            return eventMethod
        } else {
            console.error(eventName + " is not an event");
        }
    }

    removeEvent = (eventName, eventMethod) => {
        if (this._events[eventName]) {
            this._events[eventName].forEach(function (method) {
                if (eventMethod == method) {
                    delete this._events[eventName];
                    break;
                }
            })
        }
    }
}

/**
 * A peer that either uses sockets or WebRTC to connect to another person.
 *
 * @class RtcPeer
 * @extends {Event}
 */
class RtcPeer extends Event {
    constructor(socket) {
        super();
        this._socket = socket;
        this._events = {
            'message': [],
            'connected': [],
            'disconnect': []
        }

        this.disconnect = () => {
            if (this.__proto__.destroy) {
                this.__proto__.destroy();
            }
    
            this.send = () => {};
            //this.fireEvent('disconnect');
        }
    }

    _sendServer(msg) {
        this._socket.send(
            JSON.stringify(
                msg
            )
        )
    }

    /**
     * Connect to another person using the default method, WebRTC
     *
     * @param {String} peerid The id of the other person
     * @param {boolean} initiator Whether or not you're initiating this connection
     * @returns Promise
     * @memberof RtcPeer
     */
    connect(peerid, initiator) {
        const parentThis = this;
        this.peerid = peerid;

        console.log('Creating WebRTC peer ' + peerid);
        
        initiator = initiator || false;
        simplePeerConfig.initiator = initiator;
        const newPeer = new SimplePeer(simplePeerConfig);

        newPeer.on('signal', data => {
            console.log('Sending signal')
            this._sendServer({
                type: 'signal',
                to: peerid,
                signal: data
            })
        })
        
        //Initiates events on a successful connection
        const initiateEvents = () => {
            /* // Custom send method
            parentThis.send = (msg) => {
                console.log('Sending other peer message');
                newPeer.send(msg);
            }
            */
            newPeer.on('data', data => { // When you recieve a message from the other person
                parentThis.fireEvent('message', {
                    from: peerid,
                    message: data
                })
            })

            newPeer.on('close', () => { // When the connection closes
                parentThis.fireEvent('disconnect');
                console.log('Connection with peer ended');
                newPeer.destroy();
                //this._removePeer[peerid];
                //this.fireEvent('disconnect', { from: peerid });
            })

            newPeer.on('error', err => {
                parentThis.fireEvent('disconnect', err.code);
                newPeer.destroy();
                console.log('Error with peer', err.code);
            })
        }

        return new Promise((resolve, reject) => {
            let promiseDone = false;
            //newPeer.destroy();
            //return reject(); // Used to force test socket connection
            //timeout for connecting
            const timeout = setTimeout(function () {
                reject('Connection timed out');
                parentThis.fireEvent('disconnect', 'Connection timed out');
                newPeer.destroy();
            }, 20000)


            const socketMessage = function(msg) {
                var data;
                try {
                    data = JSON.parse(msg.data);
                } catch (e) {
                    console.error("Invalid JSON from server", data);
                    data = {};
                }
                if (data.type == 'signal' && data.from == peerid) {
                    newPeer.signal(data.signal);
                }
            }

            parentThis._socket.addEventListener('message', socketMessage);
            

            newPeer.on('error', err => {
                if (promiseDone) return;
                promiseDone = true;
                console.error('Error directly connecting to peer', err)
                parentThis.fireEvent('disconnect', err.code);
                newPeer.destroy();
                clearTimeout(timeout);
                reject(err.code);
            })

            newPeer.on('connect', () => {
                if (promiseDone) return;
                promiseDone = true;
                initiateEvents();
                clearTimeout(timeout);
                parentThis._socket.removeEventListener('message', socketMessage);
                parentThis.__proto__ = newPeer
                console.log('Connection established with peer');
                resolve();
                parentThis.fireEvent('connected')
            })
        })
    }

    /**
     * Connects to another person using sockets, a fallback to webrtc
     *
     * @param {String} peerid The id of the other person
     * @param {boolean} initiator Whether or not you're initiating this connection
     * @returns Promise
     * @memberof RtcPeer
     */
    connectWithSocket(peerid, initiator) {
        console.log('METHOD - Peer Creating socket peer')
        this.peerid = peerid;
        const parentThis = this;

        this.send = (msg) => {
            console.log('Sending peer socket message');
            parentThis._sendServer({
                type: 'peer-message',
                to: peerid,
                message: msg
            })
        }

        const messageEvent = this._socket.addEventListener("message", (msg) => {
            var data;
            try {
                data = JSON.parse(msg.data);
            } catch (e) {
                console.error("Invalid JSON from server", data);
                data = {};
            }

            if(data.type == 'peer-message' && data.from == peerid) {
                console.log('Socket peer message recieved');
                parentThis.fireEvent('message', {
                    from: data.from,
                    message: data.message
                })
            }
        })

        this.destroy = () => {
            this.fireEvent('disconnect');
            this._socket.removeEventListener('message', messageEvent);
        }

        this.signal = () => {
            console.log('Tried to send signal through socket peer, invalid')
        }

        if (initiator) { //If we initiated this peer socket, then tell the other peer that we created it and they need to create one too
            parentThis._sendServer({
                type: 'create-peer-socket',
                to: peerid
            })
        }
        
        return new Promise(function (resolve, reject) {
            if (!initiator) { // If we did not initiate this, then resolve the promise instantly, since we will not get a socket-response
                resolve();
                return;
            }

            const onSocketMessage = (msg) => {
                var data;
                try {
                    data = JSON.parse(msg.data);
                } catch (e) {
                    console.error("Invalid JSON from server", data);
                    data = {};
                }

                if (data.type == 'create-peer-socket-response' && data.from == peerid) {
                    parentThis._socket.removeEventListener("message", onSocketMessage)
                    parentThis.fireEvent('connected');
                    clearTimeout(timeout);
                    resolve();
                }
            }

            const timeout = setTimeout(function () {
                reject('Connection timed out');
                parentThis._socket.removeEventListener("message", onSocketMessage)
                parentThis.fireEvent('disconnect', 'Connection timed out');
            }, 30000)

            parentThis._socket.addEventListener("message", onSocketMessage)
        })
    }

    
}

class RtcRoom extends Event {
    constructor() {
        super();
        const parentThis = this;
        this._events = {
            'ready': [],
            'close': [],
            'new-connection': [],
            'message': [],
            'fatalError': [],
            'peer-disconnect': [],
            'connected': []
        }
        this._connections = {}; // List of peer IDs connected in the room
        this._pendingConnections = {}; // List of pending peer IDs (attempting to connect to you)
        
    }

    _connectToSocket() {
        // -- START Socket Setup -- \\
        const socket = new WebSocket('ws://' + config.host + ":" + config.port);
        this._socket = socket;
        const parentThis = this;

        socket.addEventListener('error', function (err) {
            parentThis.disconnect(err.reason); // Disconnect from any rooms when the socket closes
        })

        socket.addEventListener('close', function (err) {
            console.log(err);
            parentThis.disconnect(err.reason); // Disconnect from any rooms when the socket closes
        })
        
        // -- END -- \\

        return new Promise((resolve, reject) => {
            const onError = (err) => {
                socket.removeEventListener('error', onError);
                reject(err.code);
            }

            const onOpen = () => {
                socket.removeEventListener('open', onError);
                resolve();
            }

            socket.addEventListener('open', onOpen);
            socket.addEventListener('error', onError);
        })
    }

    joinRoom(roomId) {
        console.log('Joining room');
        const parentThis = this;

        return new Promise((resolve, reject) => {

            this._connectToSocket().then(() => {
                parentThis._initiateRoomMessages();

                websocketRequest(parentThis._socket, 'join-room', {id: roomId}).then(data => {
                    //Connect to host and peers
                    parentThis.host = data.host;

                    parentThis._createPeer(data.host, true).then(function () { //When we connect to the host, then we're ready to use the room
                        parentThis.fireEvent('ready')
                        resolve();
                    }).catch(err => {
                        parentThis.fireEvent('fatalError', err)
                    });

                    for (var i = 0; i < data.connections.length; i++) {
                        parentThis._createPeer(data.connections[i], true);
                    }
                }).catch(err => {
                    reject(err)
                })
            })

            
        })
    }

    createRoom() {
        console.log('Creating room');
        const parentThis = this;

        return new Promise((resolve, reject) => {

            this._connectToSocket().then(() => {
                parentThis._initiateRoomMessages(); //Initiate the socket listeners for rooms
                
                websocketRequest(parentThis._socket, 'create-room').then((data) => {
                    parentThis.hosting = true;
                    parentThis.id = data.roomId;

                    
                    resolve();
                    parentThis.fireEvent('ready', data.roomId);
                }).catch(err => {
                    parentThis.fireEvent('fatalError', err)
                    reject(err);
                })
            })
        })
    }

    disconnect(err) {
        if (this.disconnected == true) {console.log('Already disconnected'); return}

        this.disconnected = true;
        console.log('Disconnecting from server');
        this.connected = false;
        this.host = false;
        this._socket.removeEventListener("message", this._roomMessages)
        for (var peerid in this._connections) {
            try {
                this._connections[peerid].destroy();
            } catch (err) {
                console.log('Error destroying peer', err)
            }
        }
        for (var peerid in this._pendingConnections) {
            try {
                this._pendingConnections[peerid].destroy();
            } catch (err) {
                console.log('Error destroying peer', err)
            }
        }

        this._socket.close();

        this.fireEvent('close', err);

        return new Promise(function (resolve) {
            resolve();
        });
    }

    /*
    Send messages to all the peers, or a specific peer
        (optional) string peerid - The peer id to send the message to
    */
    send(msg, peerid) {
        if (peerid) {
            this._connections[peerid].send(msg);
        } else {
            for (var peerid in this._connections) {
                try {
                    this._connections[peerid].send(msg);
                }catch(err) {
                    console.log(err);
                }
            }
        }
    }

    /*
    Send a message to the server
    */
    _sendServer(msg) {
        this._socket.send(JSON.stringify(msg));
    }

    _removePeer(peerid) {
        if (this._connections[peerid]) {
            delete this._connections[peerid];
            this._connections[peerid] = null;
        }

        if (this._pendingConnections[peerid]) {
            delete this._pendingConnections[peerid];
            this._pendingConnections[peerid] = null;
        }
    }

    _disconnectFromPeer(peerid) {
        if (this._connections[peerid]) {
            console.log(this._connections[peerid])
            this._connections[peerid].disconnect();
            delete this._connections[peerid];

            this.fireEvent('peer-disconnect', peerid)
        }

        if (this._pendingConnections[peerid]) {
            this._pendingConnections[peerid].disconnect();
            delete this._pendingConnections[peerid];

            this.fireEvent('peer-disconnect', peerid)
        }

        if (peerid == this.host) {
            this.disconnect('Host closed room')
        }
    }

    _initializePeerEvents(peer){
        peer.on('message', (msg) => {
            this.fireEvent('message', msg);
        })

        peer.on('disconnect', () => {
            this._disconnectFromPeer(peer.peerid);
        })
    }

    _createPeer(peerid, initiator) {
        
        if (this._connections[peerid] || this._pendingConnections[peerid]) {
            console.log('Peer', peerid, 'already exists')
            return;
        }
        
        const newPeer = new RtcPeer(this._socket);
        this._pendingConnections[peerid] = newPeer;
        const parentThis = this;

        return new Promise((resolve, reject) => {
            console.log('METHOD - Attempting to connect to peer through WebRTC');
            newPeer.connect(peerid, initiator).then(() => {
                console.log('Successfully connected to peer through WebRTC');
                if (parentThis._pendingConnections[peerid]) { //check if something happened between connecting to the peer
                    delete parentThis._pendingConnections[peerid];
                    parentThis._connections[peerid] = newPeer;

                    parentThis.fireEvent('new-connection', peerid)

                    parentThis._initializePeerEvents(newPeer);
                    resolve();
                } else { //if its no longer in pending, just destroy the peer
                    newPeer.destroy();
                }
            }).catch(err => {
                console.log(err, 'Error connecting to peer through WebRTC, attempting through socket');
                delete parentThis._pendingConnections[peerid];

                parentThis._createSocketPeer(peerid, initiator).then( ()=> {
                    console.log('Successfully connected to peer through web socket')
                    resolve();
                }).catch(err => {
                    console.log(err, 'could not connect through socket');
                    reject();
                })
            }) 
        })
    }

    _createSocketPeer(peerid, initiator) {
        console.log('METHOD - CreateSocketPeer')
        if (this._connections[peerid] || this._pendingConnections[peerid]) {
            return new Promise((resolve, reject) => {reject('Peer already exists')});
        }
        this._pendingConnections[peerid] = 'pending';
        const parentThis = this;

        const newPeer = new RtcPeer(this._socket);
        this._pendingConnections[peerid] = newPeer;

        return new Promise((resolve, reject) => {
            newPeer.connectWithSocket(peerid, initiator).then(() => {
                console.log('Connected to peer through socket');

                delete parentThis._pendingConnections[peerid];
                parentThis._connections[peerid] = newPeer;

                parentThis._initializePeerEvents(newPeer);
                
                resolve();
            }).catch(err => {
                console.log(err, 'could not connect to peer through socket');
                delete parentThis._pendingConnections[peerid];
                reject();
            })
        })
    }

    /*
    Initiates room-specific socket messages
    */
    _initiateRoomMessages() {
        const parentThis = this;
        this._roomMessages = function (msg) {
            var data;
            try {
                data = JSON.parse(msg.data);
            } catch (e) {
                console.error("Invalid JSON from server", data);
                data = {};
            }

            switch (data.type) {
                case 'new-connection':
                    console.log('Server request to create new connection')
                    parentThis._createPeer(data.from, false);
                    break;
                case 'create-peer-socket': //Message to create a new peer socket
                    console.log('Server request to create socket peer');
                    
                    parentThis._createSocketPeer(data.from);
                    parentThis._sendServer({
                        type: 'create-peer-socket-response',
                        to: data.from
                    })
                    break;

                case 'disconnect-peer':
                    console.log('Peer disconnected');
                    parentThis._disconnectFromPeer(data.from);
                    break;
            }
        }
        this._socket.addEventListener("message", this._roomMessages)
    }
}