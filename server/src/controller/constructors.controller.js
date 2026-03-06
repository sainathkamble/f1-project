const OPENF1_BASE = "https://api.openf1.org/v1";

export const getConstructors = async (req, res) => {
  try {
    const response = await fetch(`${OPENF1_BASE}/drivers?session_key=latest`);
    if (!response.ok) throw new Error("OpenF1 fetch failed");
    const data = await response.json();

    // deduplicate
    const seen = new Set();
    const unique = data.filter(d => {
      if (seen.has(d.driver_number)) return false;
      seen.add(d.driver_number);
      return true;
    });

    // group by team
    const teamMap = new Map();
    unique.forEach(driver => {
      if (!driver.team_name) return;
      if (!teamMap.has(driver.team_name)) {
        teamMap.set(driver.team_name, {
          team_name: driver.team_name,
          team_colour: driver.team_colour,
          drivers: [],
        });
      }
      teamMap.get(driver.team_name).drivers.push(driver);
    });

    const constructors = Array.from(teamMap.values())
      .sort((a, b) => a.team_name.localeCompare(b.team_name));

    res.status(200).json(constructors);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch constructors" });
  }
};

export const getConstructorStandings = async (req, res) => {
  try {
    const response = await fetch("http://api.jolpi.ca/ergast/f1/current/constructorStandings.json");
    if (!response.ok) throw new Error("Failed");
    const data = await response.json();

    const standingsList = data?.MRData?.StandingsTable?.StandingsLists ?? [];

    if (!standingsList.length) {
      return res.status(200).json({ standings: [], season: data?.MRData?.StandingsTable?.season ?? null, round: null });
    }

    const list = standingsList[0];
    const standings = (list.ConstructorStandings ?? []).map(s => ({
      position: parseInt(s.position),
      points: parseFloat(s.points),
      wins: parseInt(s.wins),
      constructorId: s.Constructor?.constructorId,
      name: s.Constructor?.name,
      nationality: s.Constructor?.nationality,
      wikipediaUrl: s.Constructor?.url,
    }));

    res.status(200).json({
      standings,
      season: list.season,
      round: list.round,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch constructor standings" });
  }
};