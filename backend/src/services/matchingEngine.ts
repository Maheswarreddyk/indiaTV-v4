import type { ConnectedUser } from '../types/index.js';

/**
 * In-memory matching engine for real-time queue management.
 * Supabase persists queue/match records; this layer handles live pairing.
 */
export class MatchingEngine {
  private waitingQueue: ConnectedUser[] = [];
  private connectedUsers = new Map<string, ConnectedUser>();
  private socketToSession = new Map<string, string>();

  // In-memory indexes
  private genderIndex = new Map<string, Set<string>>();
  private languageIndex = new Map<string, Set<string>>();
  private countryIndex = new Map<string, Set<string>>();
  private stateIndex = new Map<string, Set<string>>();
  private cityIndex = new Map<string, Set<string>>();
  private interestIndex = new Map<string, Set<string>>();

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
    if (!user.queueEnteredAt) {
      user.queueEnteredAt = new Date();
    }
    user.joinedQueueAt = new Date();
    this.waitingQueue.push(user);
    this.indexUser(user);
  }

  removeFromQueue(sessionId: string): void {
    this.waitingQueue = this.waitingQueue.filter((u) => u.sessionId !== sessionId);
    this.deindexUser(sessionId);
    const user = this.getUserBySessionId(sessionId);
    if (user) {
      user.queueEnteredAt = undefined;
    }
  }

  getQueueLength(): number {
    return this.waitingQueue.length;
  }

  getOnlineCount(): number {
    return this.connectedUsers.size;
  }

  private indexUser(user: ConnectedUser): void {
    const id = user.sessionId;
    if (user.gender) {
      if (!this.genderIndex.has(user.gender)) this.genderIndex.set(user.gender, new Set());
      this.genderIndex.get(user.gender)!.add(id);
    }
    if (user.languages) {
      user.languages.forEach((l) => {
        if (!this.languageIndex.has(l)) this.languageIndex.set(l, new Set());
        this.languageIndex.get(l)!.add(id);
      });
    }
    if (user.country) {
      if (!this.countryIndex.has(user.country)) this.countryIndex.set(user.country, new Set());
      this.countryIndex.get(user.country)!.add(id);
    }
    if (user.state) {
      if (!this.stateIndex.has(user.state)) this.stateIndex.set(user.state, new Set());
      this.stateIndex.get(user.state)!.add(id);
    }
    if (user.city) {
      if (!this.cityIndex.has(user.city)) this.cityIndex.set(user.city, new Set());
      this.cityIndex.get(user.city)!.add(id);
    }
    if (user.interestTags) {
      user.interestTags.forEach((t) => {
        if (!this.interestIndex.has(t)) this.interestIndex.set(t, new Set());
        this.interestIndex.get(t)!.add(id);
      });
    }
  }

  private deindexUser(sessionId: string): void {
    this.genderIndex.forEach((set) => set.delete(sessionId));
    this.languageIndex.forEach((set) => set.delete(sessionId));
    this.countryIndex.forEach((set) => set.delete(sessionId));
    this.stateIndex.forEach((set) => set.delete(sessionId));
    this.cityIndex.forEach((set) => set.delete(sessionId));
    this.interestIndex.forEach((set) => set.delete(sessionId));
  }

  private calculateScore(userA: ConnectedUser, userB: ConnectedUser): { score: number; reason: string } {
    let score = 0;
    const reasons: string[] = [];

    // Mutual Preference (Weight: 50)
    const selfWantsPartner = !userA.lookingFor || 
                             userA.lookingFor.length === 0 || 
                             userA.lookingFor.includes('Anyone') || 
                             (userB.gender && userA.lookingFor.includes(userB.gender));
    const partnerWantsSelf = !userB.lookingFor || 
                             userB.lookingFor.length === 0 || 
                             userB.lookingFor.includes('Anyone') || 
                             (userA.gender && userB.lookingFor.includes(userA.gender));

    if (selfWantsPartner && partnerWantsSelf) {
      score += 50;
      reasons.push('Mutual Preference (+50)');
    }

    // Language Match (Every shared language +20, Max 40)
    if (userA.languages && userB.languages) {
      const sharedLangs = userA.languages.filter((l) => userB.languages!.includes(l));
      if (sharedLangs.length > 0) {
        const langScore = Math.min(sharedLangs.length * 20, 40);
        score += langScore;
        reasons.push(`Shared Languages (${sharedLangs.join(', ')}) (+${langScore})`);
      }
    }

    // Location (Exact City +40, District +35, State +30, Country +20)
    if (userA.city && userB.city && userA.city === userB.city) {
      score += 40;
      reasons.push(`Same City: ${userA.city} (+40)`);
    } else if (userA.district && userB.district && userA.district === userB.district) {
      score += 35;
      reasons.push(`Same District: ${userA.district} (+35)`);
    } else if (userA.state && userB.state && userA.state === userB.state) {
      score += 30;
      reasons.push(`Same State: ${userA.state} (+30)`);
    } else if (userA.country && userB.country && userA.country === userB.country) {
      score += 20;
      reasons.push(`Same Country: ${userA.country} (+20)`);
    }

    // Shared Interests (Every common interest +5, Max 40)
    if (userA.interestTags && userB.interestTags) {
      const sharedInterests = userA.interestTags.filter((i) => userB.interestTags!.includes(i));
      if (sharedInterests.length > 0) {
        const interestScore = Math.min(sharedInterests.length * 5, 40);
        score += interestScore;
        reasons.push(`Common Interests: ${sharedInterests.join(', ')} (+${interestScore})`);
      }
    }

    // Waiting Bonus (Every second waiting +1, Max 60)
    if (userB.queueEnteredAt) {
      const candidateWait = Math.floor((Date.now() - userB.queueEnteredAt.getTime()) / 1000);
      const bonus = Math.min(Math.max(candidateWait, 0), 60);
      if (bonus > 0) {
        score += bonus;
        reasons.push(`Waiting Bonus (+${bonus})`);
      }
    }

    // Penalties
    if (userA.lastPartnerSessionId === userB.sessionId) {
      score -= 100;
      reasons.push('Matched Recently (-100)');
    }

    return { score, reason: reasons.join(', ') };
  }

  tryMatch(incomingUser: ConnectedUser): { partner: ConnectedUser; score: number; reason: string } | null {
    if (this.waitingQueue.length === 0) {
      this.addToQueue(incomingUser);
      return null;
    }

    const now = new Date();
    if (!incomingUser.queueEnteredAt) {
      incomingUser.queueEnteredAt = now;
    }
    const waitingSeconds = Math.floor((now.getTime() - incomingUser.queueEnteredAt.getTime()) / 1000);

    let candidates = [...this.waitingQueue];

    // Optimize search if queue gets large: select candidates sharing at least one index match
    if (this.waitingQueue.length > 50) {
      const candidateIds = new Set<string>();
      
      if (incomingUser.city && this.cityIndex.has(incomingUser.city)) {
        this.cityIndex.get(incomingUser.city)!.forEach((id) => candidateIds.add(id));
      }
      if (incomingUser.state && this.stateIndex.has(incomingUser.state)) {
        this.stateIndex.get(incomingUser.state)!.forEach((id) => candidateIds.add(id));
      }
      if (incomingUser.country && this.countryIndex.has(incomingUser.country)) {
        this.countryIndex.get(incomingUser.country)!.forEach((id) => candidateIds.add(id));
      }
      if (incomingUser.languages) {
        incomingUser.languages.forEach((l) => {
          if (this.languageIndex.has(l)) {
            this.languageIndex.get(l)!.forEach((id) => candidateIds.add(id));
          }
        });
      }
      if (incomingUser.interestTags) {
        incomingUser.interestTags.forEach((t) => {
          if (this.interestIndex.has(t)) {
            this.interestIndex.get(t)!.forEach((id) => candidateIds.add(id));
          }
        });
      }

      if (candidateIds.size > 0) {
        candidates = this.waitingQueue.filter((u) => candidateIds.has(u.sessionId));
      }
    }

    // Exclude self and active match partners
    candidates = candidates.filter((u) => u.sessionId !== incomingUser.sessionId);

    if (candidates.length === 0) {
      this.addToQueue(incomingUser);
      return null;
    }

    // Compute scores
    const scoredCandidates = candidates.map((u) => {
      const evaluation = this.calculateScore(incomingUser, u);
      return {
        user: u,
        score: evaluation.score,
        reason: evaluation.reason,
      };
    });

    // Sort descending by score
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Apply Threshold Logic
    let target: typeof scoredCandidates[0] | undefined;
    if (waitingSeconds <= 15) {
      target = scoredCandidates.find((c) => c.score > 140);
    } else if (waitingSeconds <= 30) {
      target = scoredCandidates.find((c) => c.score > 110);
    } else if (waitingSeconds <= 60) {
      target = scoredCandidates.find((c) => c.score > 80);
    } else if (waitingSeconds <= 90) {
      target = scoredCandidates.find((c) => c.score > 50);
    } else {
      target = scoredCandidates[0];
    }

    if (!target) {
      this.addToQueue(incomingUser);
      return null;
    }

    const partner = target.user;
    this.removeFromQueue(partner.sessionId);
    this.removeFromQueue(incomingUser.sessionId);

    return {
      partner,
      score: target.score,
      reason: target.reason,
    };
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
