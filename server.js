const WebSocket = require('ws').Server;
const wss = new WebSocket({port: 9090});

const connections = {};
const rooms = {};

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

                    send({
                        type: 'join-room-response'
                    })
                    
                    conn.send(JSON.stringify({
                        type: 'new-connection-host',
                        from: rooms[data.id].host.id
                    }))

                    //Tell the other clients there's a new connection
                    const peerIdList = []
                    for (var id in rooms[data.id].connections) {
                        if (id != peerid) {
                            peerIdList.push(id);
                        }
                    }
                    

                    rooms[data.id].connections[peerid] = conn;

                    conn.send(JSON.stringify({
                        type: 'new-connection-list',
                        list: peerIdList
                    }))
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
        console.log('Peer ' + peerid + ' disconnected from socket')
        if (room) {
            if (room.host == conn) { // if the user is hosting the room they're connected to
                for (var peerid in room.connections) { //tell all the connected peers the host closed the server
                    room.connections[peerid].close();
                }
                delete rooms[roomId];
                room = undefined;
                roomId = undefined;
            } else {
                delete room.connections[peerid];
            }
        }
        delete connections[peerid];
    })
})