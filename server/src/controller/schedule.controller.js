const OPENF1_BASE = "https://api.openf1.org/v1";

export const getSchedule = async (req, res) => {
  try {
    const year = 2026;

    const [meetingsRes, sessionsRes] = await Promise.all([
      fetch(`${OPENF1_BASE}/meetings?year=${year}`),
      fetch(`${OPENF1_BASE}/sessions?year=${year}`),
    ]);

    if (!meetingsRes.ok || !sessionsRes.ok) throw new Error("OpenF1 fetch failed");

    const [meetings, sessions] = await Promise.all([
      meetingsRes.json(),
      sessionsRes.json(),
    ]);

    // attach sessions to each meeting
    const enriched = meetings
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start))
      .map(meeting => ({
        ...meeting,
        sessions: sessions
          .filter(s => s.meeting_key === meeting.meeting_key)
          .sort((a, b) => new Date(a.date_start) - new Date(b.date_start)),
      }));

    res.status(200).json(enriched);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch schedule" });
  }
};