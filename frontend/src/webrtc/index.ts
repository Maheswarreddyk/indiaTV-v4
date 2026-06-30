import type { IceServerConfig } from '../types/index.js';

const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export interface WebRTCCallbacks {
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;
  onNegotiationNeeded?: () => void;
}

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private callbacks: WebRTCCallbacks = {};
  private iceServers: IceServerConfig[] = DEFAULT_ICE_SERVERS;

  setCallbacks(callbacks: WebRTCCallbacks): void {
    this.callbacks = callbacks;
  }

  setIceServers(servers: IceServerConfig[]): void {
    this.iceServers = servers.length > 0 ? servers : DEFAULT_ICE_SERVERS;
  }

  async getLocalMedia(): Promise<MediaStream> {
    if (this.localStream) return this.localStream;

    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    return this.localStream;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  createPeerConnection(): RTCPeerConnection {
    this.cleanupPeerConnection();

    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    this.peerConnection.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      event.streams[0]?.getTracks().forEach((track) => {
        this.remoteStream!.addTrack(track);
      });
      this.callbacks.onRemoteStream?.(this.remoteStream);
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onIceCandidate?.(event.candidate.toJSON());
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        this.callbacks.onConnectionStateChange?.(this.peerConnection.connectionState);
      }
    };

    this.peerConnection.onnegotiationneeded = () => {
      this.callbacks.onNegotiationNeeded?.();
    };

    return this.peerConnection;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) this.createPeerConnection();

    const offer = await this.peerConnection!.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });

    await this.peerConnection!.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) this.createPeerConnection();

    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.warn('[WebRTC] Failed to add ICE candidate:', error);
    }
  }

  toggleMute(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  toggleCamera(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  getConnectionState(): RTCPeerConnectionState | null {
    return this.peerConnection?.connectionState ?? null;
  }

  resetConnection(): void {
    this.cleanupPeerConnection();
  }

  private cleanupPeerConnection(): void {
    if (this.peerConnection) {
      this.peerConnection.ontrack = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.onnegotiationneeded = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStream = null;
  }

  cleanup(): void {
    this.cleanupPeerConnection();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }
}

export const webrtcManager = new WebRTCManager();
