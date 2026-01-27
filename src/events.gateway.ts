import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

// We enable CORS so your frontend (even if just a local HTML file) can connect
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EventsGateway.name);
  private currentVideoUrl: string | null = null;
  private activeUsers = new Map<string, string>();

  @WebSocketServer()
  server: Server;
  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Remove user from the list
    if (this.activeUsers.has(client.id)) {
      const username = this.activeUsers.get(client.id);
      this.activeUsers.delete(client.id);

      this.logger.log(`Client disconnected: ${username} (${client.id})`);

      // Update everyone's list
      this.broadcastUserList();
    }
  }

  @SubscribeMessage('join_user')
  handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() username: string,
  ) {
    // Save the name
    this.activeUsers.set(client.id, username);
    this.logger.log(`Client joined: ${username}`);

    // 1. Send current video state to THIS user only
    if (this.currentVideoUrl) {
      client.emit('sync_video_change', this.currentVideoUrl);
    }

    // 2. Send updated user list to EVERYONE
    this.broadcastUserList();
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);

    // If a video is already selected, tell the new user immediately!
    if (this.currentVideoUrl) {
      client.emit('sync_video_change', this.currentVideoUrl);
    }
  }

  // Listen for 'play' event from a client
  @SubscribeMessage('play')
  handlePlay(
    @ConnectedSocket() client: Socket,
    @MessageBody() currentTime: number,
  ) {
    // Broadcast to everyone EXCEPT the sender
    this.logger.log(`Received ${currentTime}`);
    client.broadcast.emit('sync_play', currentTime);
  }

  @SubscribeMessage('change_video')
  handleChangeVideo(
    @ConnectedSocket() client: Socket,
    @MessageBody() videoUrl: string,
  ) {
    this.logger.log(`Client ${client.id} changed video to: ${videoUrl}`);

    // Update server state
    this.currentVideoUrl = videoUrl;

    // Tell everyone else to switch
    client.broadcast.emit('sync_video_change', videoUrl);
  }

  // Listen for 'pause' event from a client
  @SubscribeMessage('pause')
  handlePause(@ConnectedSocket() client: Socket) {
    this.logger.log(`Received pause`);
    // Broadcast to everyone EXCEPT the sender
    client.broadcast.emit('sync_pause');
  }

  @SubscribeMessage('seek')
  handleSeek(@ConnectedSocket() client: Socket, @MessageBody() time: number) {
    this.logger.log(`Client ${client.id} seeked to ${time}s`);

    // Tell everyone else to jump to this timestamp
    client.broadcast.emit('sync_seek', time);
  }

  // Helper to send the list of names
  private broadcastUserList() {
    const userList = Array.from(this.activeUsers.values());
    this.server.emit('update_user_list', userList);
  }

  @SubscribeMessage('subtitle_offset')
  handleSubtitleOffset(
    @ConnectedSocket() client: Socket,
    @MessageBody() offset: number,
  ) {
    this.logger.log('Received subtitle offset: ' + offset);
    client.broadcast.emit('sync_subtitle_offset', offset);
  }
}
