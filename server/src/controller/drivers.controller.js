const OPENF1_BASE = "https://api.openf1.org/v1";

export const getDrivers = async (req, res) => {
  try {
    const response = await fetch(`${OPENF1_BASE}/drivers?session_key=latest`);
    if (!response.ok) throw new Error("OpenF1 fetch failed");
    const data = await response.json();

    // deduplicate by driver_number
    const seen = new Set();
    const unique = data.filter(d => {
      if (seen.has(d.driver_number)) return false;
      seen.add(d.driver_number);
      return true;
    });

    res.status(200).json(unique.sort((a, b) => a.driver_number - b.driver_number));
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch drivers" });
  }
};

// Add to existing f1.controller.js

export const getDriverDetails = async (req, res) => {
  try {
    const { driverId } = req.params;

    const [driverRes, standingsRes, resultsRes] = await Promise.all([
      fetch(`http://api.jolpi.ca/ergast/f1/drivers/${driverId}.json`),
      fetch(`http://api.jolpi.ca/ergast/f1/drivers/${driverId}/driverStandings.json?limit=100`),
      fetch(`http://api.jolpi.ca/ergast/f1/drivers/${driverId}/results.json?limit=1000`),
    ]);

    const [driverData, standingsData, resultsData] = await Promise.all([
      driverRes.json(),
      standingsRes.json(),
      resultsRes.json(),
    ]);

    const driver = driverData?.MRData?.DriverTable?.Drivers?.[0];
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    const allStandings = standingsData?.MRData?.StandingsTable?.StandingsLists ?? [];
    const allResults = resultsData?.MRData?.RaceTable?.Races ?? [];

    // career stats
    const championships = allStandings.filter(s =>
      s.DriverStandings?.[0]?.position === "1"
    ).length;

    const wins = allResults.filter(r =>
      r.Results?.[0]?.position === "1"
    ).length;

    const podiums = allResults.filter(r =>
      ["1", "2", "3"].includes(r.Results?.[0]?.position)
    ).length;

    const points = allResults.reduce((sum, r) => {
      return sum + parseFloat(r.Results?.[0]?.points ?? 0);
    }, 0);

    const polePositions = allResults.filter(r =>
      r.Results?.[0]?.grid === "1"
    ).length;

    const fastestLaps = allResults.filter(r =>
      r.Results?.[0]?.FastestLap?.rank === "1"
    ).length;

    const seasons = [...new Set(allResults.map(r => r.season))].sort();
    const teams = [...new Set(
      allResults.flatMap(r => r.Results?.map(res => res.Constructor?.name) ?? [])
    )].filter(Boolean);

    const latestStanding = allStandings[allStandings.length - 1];

    res.status(200).json({
      driverId: driver.driverId,
      givenName: driver.givenName,
      familyName: driver.familyName,
      dateOfBirth: driver.dateOfBirth,
      nationality: driver.nationality,
      permanentNumber: driver.permanentNumber,
      code: driver.code,
      url: driver.url,
      stats: {
        championships,
        wins,
        podiums,
        polePositions,
        fastestLaps,
        totalPoints: Math.round(points),
        totalRaces: allResults.length,
        seasons: seasons.length,
        firstSeason: seasons[0] ?? null,
        latestSeason: seasons[seasons.length - 1] ?? null,
        teams,
        currentStanding: latestStanding?.DriverStandings?.[0] ?? null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch driver details" });
  }
};

export const getErgastDriverId = async (req, res) => {
  try {
    const { season } = req.params;
    const response = await fetch(`http://api.jolpi.ca/ergast/f1/${season}/drivers.json?limit=100`);
    const data = await response.json();
    const drivers = data?.MRData?.DriverTable?.Drivers ?? [];

    // return map of code → driverId  e.g. { "HAM": "hamilton", "VER": "verstappen" }
    const map = {};
    drivers.forEach(d => {
      if (d.code) map[d.code] = d.driverId;
    });

    res.status(200).json(map);
  } catch {
    res.status(500).json({ message: "Failed to fetch driver map" });
  }
};

export const getDriverStandings = async (req, res) => {
  try {
    const response = await fetch("http://api.jolpi.ca/ergast/f1/current/driverStandings.json");
    if (!response.ok) throw new Error("Failed");
    const data = await response.json();

    const standingsList = data?.MRData?.StandingsTable?.StandingsLists ?? [];

    // season not started yet — no standings list
    if (!standingsList.length) {
      return res.status(200).json({ standings: [], season: data?.MRData?.StandingsTable?.season ?? null, round: null });
    }

    const list = standingsList[0];
    const standings = (list.DriverStandings ?? []).map(s => ({
      position: parseInt(s.position),
      points: parseFloat(s.points),
      wins: parseInt(s.wins),
      driverId: s.Driver?.driverId,
      code: s.Driver?.code,
      permanentNumber: s.Driver?.permanentNumber,
      givenName: s.Driver?.givenName,
      familyName: s.Driver?.familyName,
      fullName: `${s.Driver?.givenName} ${s.Driver?.familyName}`,
      nationality: s.Driver?.nationality,
      dob: s.Driver?.dateOfBirth,
      wikipediaUrl: s.Driver?.url,
      team: s.Constructors?.[0]?.name ?? null,
      teamId: s.Constructors?.[0]?.constructorId ?? null,
      teamNationality: s.Constructors?.[0]?.nationality ?? null,
    }));

    res.status(200).json({
      standings,
      season: list.season,
      round: list.round,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch driver standings" });
  }
};