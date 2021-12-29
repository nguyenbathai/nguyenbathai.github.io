const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const { v4: uuidV4 } = require("uuid");

app.set("view engine", "ejs");
app.use(
  "/simple-peer",
  express.static(__dirname + "/node_modules/simple-peer/")
);
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.redirect("/yg-rtc-room");
});

app.get("/:room", (req, res) => {
  res.render("room", { roomId: req.params.room, userId: uuidV4() });
});

io.on("connection", (socket) => {
  socket.on("join-room", (roomId, userInfo) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-connected", userInfo);

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-disconnected", userInfo.userId);
    });
  });

  // signal (i.e. create/answer offer to RTCPeerConnection) between users
  socket.on(
    "signaling",
    (roomId, fromUserId, toUserId, data, isInitial, userInfo) => {
      socket
        .to(roomId)
        .emit("signaling", fromUserId, toUserId, data, isInitial, userInfo);
    }
  );
});

server.listen(3000);
