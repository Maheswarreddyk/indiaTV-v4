import type { ConnectedUser } from '../types/index.js';

/**
 * In-memory matching engine for real-time queue management.
 * Supabase persists queue/match records; this layer handles live pairing.
 */
export class MatchingEngine {
  private waitingQueue: ConnectedUser[] = [];
  private connectedUsers = new Map<string, ConnectedUser>();
  private socketToSession = new Map<string, string>();

  registerUser(user: ConnectedUser): void {
    this.connectedUsers.set(user.sessionId, user);
    this.socketToSession.set(user.socketId, user.sessionId);
  }

  unregisterUser(sessionId: string): ConnectedUser | undefined {
    const user = this.connectedUsers.get(sessionId);
    if (user) {
      this.connectedUsers.delete(sessionId);
      this.socketToSession.delete(user.socketId);
      this.removeFromQueue(sessionId);
    }
    return user;
  }

  getUserBySessionId(sessionId: string): ConnectedUser | undefined {
    return this.connectedUsers.get(sessionId);
  }

  getUserBySocketId(socketId: string): ConnectedUser | undefined {
    const sessionId = this.socketToSession.get(socketId);
    if (!sessionId) return undefined;
    return this.connectedUsers.get(sessionId);
  }

  updateSocketId(sessionId: string, newSocketId: string): void {
    const user = this.connectedUsers.get(sessionId);
    if (!user) return;

    this.socketToSession.delete(user.socketId);
    user.socketId = newSocketId;
    this.socketToSession.set(newSocketId, sessionId);
  }

  addToQueue(user: ConnectedUser): void {
    this.removeFromQueue(user.sessionId);
    user.joinedQueueAt = new Date();
    this.waitingQueue.push(user);
  }

  removeFromQueue(sessionId: string): void {
    this.waitingQueue = this.waitingQueue.filter((u) => u.sessionId !== sessionId);
  }

  getQueueLength(): number {
    return this.waitingQueue.length;
  }

  getOnlineCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Attempt to match incoming user with someone in queue.
   * Avoids consecutive rematch with last partner when possible.
   */
  tryMatch(incomingUser: ConnectedUser): ConnectedUser | null {
    if (this.waitingQueue.length === 0) {
      this.addToQueue(incomingUser);
      return null;
    }

    let partnerIndex = -1;

    for (let i = 0; i < this.waitingQueue.length; i++) {
      const candidate = this.waitingQueue[i];
      if (candidate.sessionId === incomingUser.sessionId) continue;

      if (incomingUser.lastPartnerSessionId && candidate.sessionId === incomingUser.lastPartnerSessionId) {
        continue;
      }

      partnerIndex = i;
      break;
    }

    if (partnerIndex === -1) {
      for (let i = 0; i < this.waitingQueue.length; i++) {
        if (this.waitingQueue[i].sessionId !== incomingUser.sessionId) {
          partnerIndex = i;
          break;
        }
      }
    }

    if (partnerIndex === -1) {
      this.addToQueue(incomingUser);
      return null;
    }

    const partner = this.waitingQueue.splice(partnerIndex, 1)[0];
    this.removeFromQueue(incomingUser.sessionId);

    incomingUser.lastPartnerSessionId = partner.sessionId;
    partner.lastPartnerSessionId = incomingUser.sessionId;

    return partner;
  }

  setMatch(userA: ConnectedUser, userB: ConnectedUser, matchId: string): void {
    userA.currentMatchId = matchId;
    userA.partnerSessionId = userB.sessionId;
    userB.currentMatchId = matchId;
    userB.partnerSessionId = userA.sessionId;
  }

  clearMatch(user: ConnectedUser): void {
    user.currentMatchId = undefined;
    user.partnerSessionId = undefined;
  }
}

export const matchingEngine = new MatchingEngine();
