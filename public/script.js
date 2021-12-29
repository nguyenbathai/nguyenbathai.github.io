/**
 * YG Ventures 2021
 * @author: sondc
 */

const socket = io("/");
const videoGrid = document.getElementById("video-grid");

const myVideo = document.createElement("video");
myVideo.muted = true;

const servers = {
  iceServers: [
    {
      urls: ["turn:turn.sondc.dev"],
      username: "test",
      credential: "test123",
    },
  ],
  iceTransportPolicy: "relay",
};

// map userId -> {
//      userId,
//      userName,
//      timeJoin,
//      peerConnection(simple peer between this client with user has id "userId"),
// }
var userInfoMap = new Map();
var self = {
  userId: USER_ID,
  userName: USER_NAME,
  timeJoin: new Date().getTime(),
};

console.log("our id: ", USER_ID);

var selfStream = null;

// request media stream
navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: true,
  })
  .then(
    (stream) => {
      selfStream = stream;
      addVideoStream(myVideo, stream);
      startJoinRoom();
    },
    (err) => {
      console.error(err);
      alert("Failed to get media stream");
      startJoinRoom();
    }
  );

// user left the room, try to remove on the UI, also in the map
socket.on("user-disconnected", (userId) => {
  console.log("disconnected: ", userId);
  if (userInfoMap.has(userId)) {
    userInfoMap.delete(userId);
  }
});

function startJoinRoom() {
  self.timeJoin = new Date().getTime();
  socket.emit("join-room", ROOM_ID, self);

  // listen even when new user join room
  socket.on("user-connected", (userInfo) => {
    connectToNewUser(userInfo);
  });

  // listen when user in room try to signal other user
  socket.on("signaling", (fromUserId, toUserId, data, isInitial, userInfo) => {
    // only handle when the destiny toUserId is us
    if (toUserId === self.userId) {
      if (isInitial) {
        // fromUserId is the initial peer

        let peer = null;
        if (userInfoMap.has(fromUserId) && userInfoMap.get(fromUserId).peer) {
          peer = userInfoMap.get(fromUserId).peer;
        } else {
          peer = new SimplePeer({
            initiator: false,
            config: servers,
          });
          peer.on("error", (err) => console.log("error", err));
          peer.on("signal", (data) => {
            console.log("signal");
            // send the signal back to the initial peer
            socket.emit(
              "signaling",
              ROOM_ID,
              toUserId,
              fromUserId,
              data,
              false,
              self
            );
          });
          peer.on("connect", () => {
            console.log("connect to ", userInfo.userName);
            // send stream
            if (selfStream) peer.addStream(selfStream);
          });

          const video = document.createElement("video");
          peer.on("stream", (stream) => {
            addVideoStream(video, stream);
          });

          peer.on("data", (data) => {
            newChatMsg(userInfo.userName, data?.toString());
          });

          peer.on("close", () => {
            // clean UI
            video.remove();
          });

          userInfoMap.set(fromUserId, {
            userId: userInfo.userId,
            userName: userInfo.userName,
            timeJoin: userInfo.timeJoin,
            peer: peer,
          });
        }

        peer.signal(data);
      } else {
        // we are initial peer

        if (!userInfoMap.has(fromUserId)) {
          alert("WTF is going on?");
          console.error("we are the initial peer but can not find userInfoMap");
          return;
        }
        const peer = userInfoMap.get(fromUserId).peer;
        peer.signal(data);
      }
    }
  });
}

function connectToNewUser(userInfo) {
  if (!userInfo) return;
  if (userInfoMap.has(userInfo.userId)) {
    alert("WTF? we have already connected to this user: " + userInfo.userId);
    return;
  }
  // create new peer and send the information to the user through signaling server
  const peer = new SimplePeer({
    initiator: true,
    config: servers,
  });
  peer.on("error", (err) => console.log("error", err));
  peer.on("signal", (data) => {
    // send the signal back to the initial peer
    socket.emit(
      "signaling",
      ROOM_ID,
      self.userId,
      userInfo.userId,
      data,
      true,
      self
    );
  });
  peer.on("connect", () => {
    console.log("connect to ", userInfo.userName);
    // send stream
    if (selfStream) peer.addStream(selfStream);
  });
  const video = document.createElement("video");
  peer.on("stream", (stream) => {
    addVideoStream(video, stream);
  });

  peer.on("data", (data) => {
    newChatMsg(userInfo.userName, data?.toString());
  });

  peer.on("close", () => {
    // clean UI
    video.remove();
  });

  userInfoMap.set(userInfo.userId, {
    userId: userInfo.userId,
    userName: userInfo.userName,
    timeJoin: userInfo.timeJoin,
    peer: peer,
  });
}

function addVideoStream(video, stream) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
  });
  videoGrid.append(video);
}

// handle chat
document.querySelector("form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const chatContentElem = document.querySelector("#chatbox");
  if (chatContentElem && chatContentElem.value) {
    const msgText = chatContentElem.value.toString();
    newChatMsg("You", msgText);
    userInfoMap.forEach((u) => {
      if (u?.peer) {
        u.peer.send(msgText);
        chatContentElem.value = "";
      }
    });
  }
});

function newChatMsg(userName, msg) {
  msgElem = document.createElement("p");
  msgElem.innerHTML = `<b>${escapeHtml(userName)}: </b> ${escapeHtml(msg)}`;
  document.querySelector("#chat-content").prepend(msgElem);
}

function escapeHtml(html) {
  var text = document.createTextNode(html);
  var p = document.createElement("p");
  p.appendChild(text);
  return p.innerHTML;
}
