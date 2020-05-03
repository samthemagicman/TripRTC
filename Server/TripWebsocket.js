const WebSocket = require('ws').Server;

/*Generates a unique ID*/
const genId = () => (Math.random().toString(36)).substr(2, 16);

/*
Generates a PeerID and adds the connection to the list of connections
*/
function createConnection(conn) {
    return new Promise(function(resolve, reject) {
        var peerid = genId();
        while (connections[peerid]) {
            peerid = genId();
        }
    
        connections[peerid] = conn;
        resolve(peerid);
    })
}

module.exports = function(server) {
    console.log('Starting TripRTC server');
    const wss = new WebSocket({
        server: server
    });
    wss.on('connection', (conn) => {
        function send(msg) { //Send a message to the client
            conn.send(JSON.stringify(msg));
        }

        let peerid;
        let room;
        let roomId;
        //Create a unique peer id
        createConnection(conn).then((id) => {
            console.log('Creating peer ID');
            peerid = id;
            conn.id = peerid;
            conn.peerid = id;
        })

        conn.on('message', (msg) => {
            var data;
            //accepting only JSON messages 
            try {
                data = JSON.parse(msg); 
            } catch (e) { 
                console.log("Invalid JSON"); 
                data = {}; 
            } 
            
            switch(data.type) {
                case 'signal': //Pass along signals from SimplePeer to other peers
                    if (connections[data.to]) {
                        connections[data.to].send(JSON.stringify({
                            type: 'signal',
                            signal: data.signal,
                            from: peerid
                        }))
                    }
                    break;
                case 'new-connection': //Pass along signals from SimplePeer to other peers
                    console.log('Passing on new connection request');
                    if (connections[data.to]) {
                        connections[data.to].send(JSON.stringify({
                            type: 'new-connection',
                            from: peerid
                        }))
                    }
                    break;
                case 'create-peer-socket': //Pass along that a user needs to create a peer socket
                    if(connections[data.to]) {
                        connections[data.to].send(
                            JSON.stringify({
                                type: 'create-peer-socket',
                                from: peerid
                            })
                        )
                    }
                    break;
                case 'create-peer-socket-response': //Pass along that a user needs to create a peer socket
                    if(connections[data.to]) {
                        connections[data.to].send(
                            JSON.stringify({
                                type: 'create-peer-socket-response',
                                from: peerid
                            })
                        )
                    }
                    break;
                case 'disconnect-peer':
                    if (connections[data.to]) {
                        connections[data.to].send(
                            JSON.stringify(
                                {
                                    type: 'disconnect-peer',
                                    from: peerid
                                }
                            )
                        )
                    }
                    break;
                case 'peer-message': //Pass along a message from a peer using sockets
                    if(connections[data.to] && data.message) {
                        connections[data.to].send(
                            JSON.stringify({
                                type: 'peer-message',
                                message: data.message,
                                from: peerid
                            })
                        )
                    }
                    break;
                case 'create-room': //Request to create a room
                    console.log('Creating room');
                    var roomid = genId();
                    
                    while (rooms[roomid]) {
                        roomid = genId();
                    }

                    rooms[roomid] = {
                        host: conn,
                        connections: {}
                    }

                    console.log('Room created with id', roomid);
                    conn.send(JSON.stringify({
                        type:'create-room-response',
                        roomId: roomid
                    }))

                    roomId = roomid;
                    room = rooms[roomid];
                    break;
                case 'join-room':
                    if (rooms[data.id]) {
                        console.log('Joining room');
                        roomId = data.id;
                        room = rooms[data.id];

                        //Tell the other clients there's a new connection
                        const peerIdList = []
                        for (var id in rooms[data.id].connections) {
                            if (id != peerid) {
                                rooms[data.id].connections[id].send(JSON.stringify({ //Tell all the other clients in the room that there's a new connection
                                    type: 'new-connection',
                                    from: peerid
                                }))
                                peerIdList.push(id);
                            }
                        }

                        rooms[data.id].host.send(JSON.stringify({ //Tell host there's a new connection
                            type: 'new-connection',
                            from: peerid
                        }))
                        
                        rooms[data.id].connections[peerid] = conn;

                        send({
                            type: 'join-room-response',
                            host: rooms[data.id].host.id,
                            connections: peerIdList
                        })

                    } else {
                        console.log('Room not found');
                        send({
                            type: 'join-room-response',
                            error: 'Room not found'
                        })
                    }
                    break;
            }
        })

        //Delete the peer id from the list or rooms
        
        conn.on('close', () => {
            const peerid = conn.peerid;
            console.log('Peer ' + peerid + ' disconnected from socket')
            if (room) {
                if (room.host == conn) { // if the user is hosting the room they're connected to
                    for (var id in room.connections) { //tell all the connected peers the host closed the server
                        room.connections[id].close(1000, 'Host disconnected');
                    }
                    delete rooms[roomId];
                    room = undefined;
                    roomId = undefined;
                } else {
                    room.host.send(
                        JSON.stringify({
                            type: 'disconnect-peer',
                            from: peerid
                        })
                    )
                    for (var id in room.connections) { //tell all the connected peers this host disconnected....
                        room.connections[id].send(
                            JSON.stringify({
                                type: 'disconnect-peer',
                                from: peerid
                            })
                        )
                    }
                    delete room.connections[id];
                }
            }
            delete connections[peerid];
        })
    })
}