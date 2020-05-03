global.connections = {}
global.rooms = {}

const TripWebsocket = require('./TripWebsocket.js')
const TripExpress = require('./TripExpress.js');
const server = require('http').createServer();

server.on('request', TripExpress);

TripWebsocket(server);

server.listen(9090);