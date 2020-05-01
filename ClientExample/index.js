//pp

var peer;
var room;

$("#createroom").click(function() {
    peer = new TripPeer();
    peer.initialize().then(function() {
        peer.createRoom().then(function(room2) {
            room = room2;
            console.log(room.id);

            room.on('disconnect', (data) => {
                $("#messages").append("<br> Disconnected " + data.from);
            })

            room.on('connection', (data) => {
                $("#messages").append("<br> Connected " + data.from);
            })

            room.on('message', (data) => {
                $("#messages").append("<br>" + data.from + " : " + data.message)
            })
        })
    }).catch( err => {
        console.log(err);
    })

    /*peer.on('roomCreated', function(roomData) {
        console.log(roomData.id);
    })*/
}),

$('#disconnect').click(function() {
    peer.disconnect();
})

$('#joinroom').click(function() {
    var roomid = $("#roomId").val();

    peer = new TripPeer();

    peer.initialize().then(() => {

        peer.joinRoom(roomid).then(function(room2) {
            console.log('Client Joined room')
            room = room2;
            console.log(room2);

            room2.on('disconnect', (data) => {
                $("#messages").append("<br> Disconnected " + data.from);
            })

            room2.on('connection', (data) => {
                $("#messages").append("<br> Connected " + data.from);
            })

            room2.on('message', (data) => {
                $("#messages").append("<br>" + data.from + " : " + data.message)
            })

        }).catch(err => {
            console.log(err);
        })


    }).catch(err => {
        console.log(err);
    })
})

$('#sendMessage').click(function() {
    var msg = $("#messageText").val();

    room.send(msg);
})