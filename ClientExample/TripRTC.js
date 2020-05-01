/*
Client-side TripRTC library using simplepeer
*/

function createPeerConnection() {
    return new RTCPeerConnection({
        "iceServers": [
          {
            "url": "stun:138.128.241.13:3478"
          },
          {
            "url": "stun:138.128.241.13:3478?transport=tcp"
          },
          {
            "url": "turn:138.128.241.13:3478",
            "username": "root",
            "credential": "password"
          },
          {
            "url": "turn:138.128.241.13:3478?transport=tcp",
            "username": "root",
            "credential": "password"
          }
        ]
      }
    )
}

var config = {
    "host": 'localhost',
    "port": 9090,
    'path': '/server'
}

/**
 * TODO:
 * Split up TripPeer and Room classes
 * Comments
 */


class TripPeer {
    constructor() {
        const parentThis = this;
        this._events = {
            'ready': [],
            'fatalError': [],
            'roomCreated': []
        };

        this.roomInfo = {
            connected: false
        }

        this._connections = {}

        this.fireEvent = (eventName, data) => {
            this._events[eventName].forEach((method) => method(data))
        }
    }

    initialize() {
        const parentThis = this;
        const socket = new WebSocket('ws://'+config.host+":"+config.port);
        this._socket = socket;

        socket.addEventListener('error', function(err) {
            parentThis.disconnect(); // Disconnect from any rooms when the socket closes
        })

        socket.addEventListener('close', function(err) {
            parentThis.disconnect(); // Disconnect from any rooms when the socket closes
        })


        return new Promise((resolve, reject) => {
            socket.addEventListener('error', function(err) {
                reject('There was an error conecting to the server');
            })

            socket.addEventListener('open', function() {
                resolve();
                parentThis.fireEvent('ready');
            })
        })
    }

    _sendServer(msg) {
        this._socket.send(JSON.stringify(msg));
    }

    disconnect() {
        if (this.room) {
            this.room.disconnect();
        }
        this._socket.close();
    }

    joinRoom(roomId) {
        const parentThis = this;
        return new Promise((resolve, reject) => {
            const room =  new TripRoom(this, false, roomId);
            room.on("ready", function() {
                parentThis.room = room;
                resolve(room);
            })

            room.on('fatalError', function(err) {
                reject(err);
            })
        })
    }

    /*
        Tells the server that we're creating a room
    */
    createRoom() {
        const parentThis = this;
        return new Promise((resolve, reject) => {
            const room =  new TripRoom(this, true);
            room.on("ready", function() {
                parentThis.room = room;
                resolve(room);
            })

            room.on('fatalError', function(err) {
                reject(err);
            })
        })
    }

    //-- Events --\\
        on = (eventName, eventMethod) => {
            if (this._events[eventName]) {
                this._events[eventName].push(eventMethod);
                return eventMethod
            } else {
                console.log(eventName + " is not an event of Peer");
            }
        }

        removeEvent = (eventName, eventMethod) => {
            if (this._events[eventName]) {
                this._events[eventName].forEach(function(method) {
                    if (eventMethod == method) {
                        delete this._events[eventName];
                        break;
                    }
                })
            }
        }
    //-- End Events --\\
}

class TripRoom {
    constructor(TripPeer, creating, roomId){
        this._connections = {};
        this._pendingConnections = {};
        this._events = {
            'ready': [],
            'fatalError': [],
            'attemptingConnection': [],
            'connection': [],
            'disconnect': [],
            'message': []
        }
        this._tripPeer = TripPeer;
        this._socket = TripPeer._socket
        var parentThis = this;

        this.fireEvent = (eventName, data) => {
            this._events[eventName].forEach((method) => method(data))
        }

        function createRoom() {
            console.log('Creating room');
            let serverResponded = false;

            //Timeout in case the server doesn't respond
            setTimeout(() => {
                if (!serverResponded) {
                    parentThis.fireEvent('fatalError', 'No response from server')
                    parentThis._socket.removeEventListener('message', onRoomCreate);
                }
            }, 30000)


            let onRoomCreate = function(msg) {
                let data = JSON.parse(msg.data);
                if (data.type == ("create-room-response")) { //Server responded
                    serverResponded = true;

                    parentThis.hosting = true;
                    parentThis.id = data.roomId;
                    
                    parentThis._initiateRoomMessages(); //Initiate the socket listeners for rooms
                    
                    parentThis._socket.removeEventListener('message', onRoomCreate);
                    parentThis.fireEvent('ready', data.roomId);
                }
            }
            parentThis._socket.addEventListener('message', onRoomCreate)
            
            //Tell the server we're creating a room
            parentThis._sendServer({
                type: 'create-room'
            })
        }

        function joinRoom() {
            console.log('Joining room');
            var serverResponded = false;

            //A timeout in case the server doesn't respond
            setTimeout(() => {
                if (!serverResponded) {
                    parentThis.fireEvent('fatalError', 'Server did not respond');
                    parentThis._socket.removeEventListener('message', onRoomJoin);
                }
            }, 30000)

            var onRoomJoin = function(msg) {
                var data = JSON.parse(msg.data);
                if (data.type == "join-room-response") {
                    serverResponded = true;
                    parentThis._socket.removeEventListener('message', onRoomJoin);
                    
                    if (data.error == undefined) {
                        parentThis._initiateRoomMessages();
                    } else {
                        parentThis.fireEvent('fatalError', data.error);
                    }
                    //parentThis.fireEvent('roomCreated', {id: data.roomId});
                }
            }
            parentThis._socket.addEventListener('message', onRoomJoin)
            
            console.log('Sending room join request to server', roomId)
            parentThis._sendServer({
                type: 'join-room',
                id: roomId
            })
        }

        if (creating) { //true that they are creating a room
            createRoom();
        } else { //not creating, so they're joining
            joinRoom();
        }
        
    }

    disconnect() {
        this.connected = false;
        this.host = false;
        this._socket.removeEventListener("message", this._roomMessages)
        for (var peerid in this._connections) {
            this._connections[peerid].destroy();
        }
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
                this._connections[peerid].send(msg);
            }
        }
    }

    _sendServer(msg) {
        this._tripPeer._sendServer(msg);
    }

    /*
        Create a connection between another person
        string peerid - The peer id of the other user
        boolean initiator - Whether or not this peer is the initiator (will send signals to the other user)
    */
    _createPeer(peerid, initiator) {
        if (this._connections[peerid] != undefined || this._pendingConnections[peerid] != undefined) {
            console.log('SimplePeer already found ' + peerid);
            return;
        }
        
        console.log('Creating SimplePeer ' + peerid);

        const newPeer = new SimplePeer({
            initiator: initiator,
            objectMode: true,
            trickle: true,
            config: {
                "iceServers": [
                    {
                      "url": "stun:stun.l.google.com:19302"
                    },
                    {
                      "url": "stun:138.128.241.13:3478?transport=udp"
                    },
                    {
                      "url": "turn:138.128.241.13:3478?transport=udp",
                      "username": "root",
                      "credential": "password"
                    },
                  ]
            }
        });

        this.fireEvent('attemptingConnection', peerid);

        newPeer.id = peerid;

        this._pendingConnections[peerid] = newPeer;

        //Send the signals to the server
        newPeer.on('signal', data => {
            console.log('Signal', data)
            this._sendServer({
                type: 'signal',
                to: peerid,
                signal: data
            })
        })

        newPeer.on('data', data => {
            this.fireEvent('message', {
                from: peerid,
                message: data
            })
            console.log(data);
        })

        newPeer.on('close', () => {
            console.log('Connection with peer ended');
            delete this._pendingConnections[peerid];
            delete this._connections[peerid];
            this.fireEvent('disconnect', {from: peerid});
        })

        const parentThis = this;
        return new Promise((resolve, reject) => {
            let connected = false;

            //timeout for connecting
            setTimeout(function() {
                if (connected == false) {
                    reject('Connection timed out');
                }
            }, 30000)

            newPeer.on('error', err => {
                console.log('Error with peer', err.code);
                reject(err.code);
                delete parentThis._pendingConnections[peerid];
                delete parentThis._connections[peerid];
                parentThis.fireEvent('disconnect', {from: peerid, error: err});
                //parentThis._createPeer(peerid, true); //Retry connection
                var errCode = err.code
            })

            newPeer.on('connect', () => {
                console.log('Connection established with peer');
                connected = true;
                delete this._pendingConnections[peerid];
                parentThis._connections[peerid] = newPeer;
                resolve();
                parentThis.fireEvent('connection', {from:peerid})
            })
        })
    }

    /*
    Initiates room-specific socket messages
    */
    _initiateRoomMessages() {
        const parentThis = this;
        this._roomMessages = function(msg) {
            var data;
            try {
                data = JSON.parse(msg.data); 
             } catch (e) { 
                console.log("Invalid JSON"); 
                data = {}; 
             }

             switch(data.type) {
                case 'new-connection-host': //Server telling us the host peer id
                    parentThis.host = data.from;
                    parentThis._createPeer(data.from, true).then(function() { //When we connect to the host, then we're ready to use the room
                        parentThis.fireEvent('ready')
                    }).catch(err => {
                        parentThis.fireEvent('fatalError', err)
                    });
                    break;
                case 'new-connection-list': //The list of other connected users
                    for (var i = 0; i < data.list.length; i++) {
                        parentThis._createPeer(data.list[i], true);
                    }
                    break;
                case 'signal':
                    if (parentThis._connections[data.from]) {
                        console.log('Theres already a connection with that peer. Why is there a signal?')
                    } else {
                        if (parentThis._pendingConnections[data.from]) {
                            console.log('Adding signal');
                        } else {
                            parentThis._createPeer(data.from, false);
                            console.log('No peer for signal -- Creating new peer');
                        }
                        parentThis._pendingConnections[data.from].signal(data.signal);
                    }
                    break;
             }
        }
        this._socket.addEventListener("message", this._roomMessages)
    }

    //-- Events --\\
        on = (eventName, eventMethod) => {
            if (this._events[eventName]) {
                this._events[eventName].push(eventMethod);
                return eventMethod
            } else {
                console.log(eventName + " is not an event of Peer");
            }
        }

        removeEvent = (eventName, eventMethod) => {
            if (this._events[eventName]) {
                this._events[eventName].forEach(function(method) {
                    if (eventMethod == method) {
                        delete this._events[eventName];
                        break;
                    }
                })
            }
        }
    //-- End Events --\\
}