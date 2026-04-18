// In-memory mock database for demo purposes
export const mockState = {
  user: { id: 1, name: "Demo Student", email: "demo@synapset.ai", xp: 450, streak: 7, level: 3 },
  subjectCards: [
    { topic: "Action Potentials", retentionPercent: 45.2, daysSinceStudy: 2.5, nextRevisionDate: new Date().toISOString(), isUrgent: true, sessionId: 101 },
    { topic: "Photosynthesis", retentionPercent: 82.5, daysSinceStudy: 0.8, nextRevisionDate: new Date(Date.now() + 86400000).toISOString(), isUrgent: false, sessionId: 102 },
    { topic: "Linear Algebra", retentionPercent: 95.0, daysSinceStudy: 0.1, nextRevisionDate: new Date(Date.now() + 86400000 * 3).toISOString(), isUrgent: false, sessionId: 103 }
  ],
  studySessions: [
    { id: 101, userId: 1, topic: "Action Potentials", duration: 30, difficulty: 4, notes: null, createdAt: new Date(Date.now() - 86400000 * 2.5).toISOString() },
    { id: 102, userId: 1, topic: "Photosynthesis", duration: 45, difficulty: 3, notes: null, createdAt: new Date(Date.now() - 86400000 * 0.8).toISOString() },
    { id: 103, userId: 1, topic: "Linear Algebra", duration: 60, difficulty: 5, notes: null, createdAt: new Date(Date.now() - 86400000 * 0.1).toISOString() }
  ],
  totalStudySessions: 3,
  totalFocusSessions: 12,
  totalBrainBreaks: 5,
  avgFocusScore: 88.5,
  nextSessionId: 104
};
