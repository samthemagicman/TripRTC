//pp

var peer;
var room;

$("#createroom").click(function() {
    room = new RtcRoom();
    room.createRoom().then(function() {
        console.log(room.id);
        room.on('close', (reason) => {
            console.error('disconnect room')
            $("#messages").append("<br> Room closed " + reason);
        })


        room.on('peer-disconnect', (data) => {
            console.error('disconnect peer');
            $("#messages").append("<br> Disconnected " + data);
        })

        room.on('new-connection', (data) => {
            $("#messages").append("<br> Connected " + data);
        })

        room.on('message', (data) => {
            $("#messages").append("<br>" + data.from + " : " + data.message)
        })
    }).catch( err => {
        $("#messages").append("<br> Error creating: " + err)
    })

    /*peer.on('roomCreated', function(roomData) {
        console.log(roomData.id);
    })*/
}),

$('#disconnect').click(function() {
    room.disconnect();
})

$('#joinroom').click(function() {
    var roomid = $("#roomId").val();

    room = new RtcRoom();

    room.joinRoom(roomid).then(() => {
            room.on('close', (reason) => {
                console.error('disconnect room')
                $("#messages").append("<br> Room closed " + reason);
            })

            room.on('peer-disconnect', (data) => {
                $("#messages").append("<br> Disconnected " + data);
            })

            room.on('new-connection', (data) => {
                $("#messages").append("<br> Connected " + data);
            })
            
            room.on('message', (data) => {
                console.log('recieved message')
                $("#messages").append("<br>" + data.from + " : " + data.message)
            })
    }).catch(err => {
        console.log(err);
    })
})

$('#sendMessage').click(function() {
    var msg = $("#messageText").val();

    room.send(msg);
})