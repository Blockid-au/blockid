// Vesting compute engine (server + client safe).

export interface VestingSchedule {
  id: string;
  shareholderName: string;
  grantDate: string;
  totalShares: number;
  vestedShares: number;
  vestingType: "linear" | "back_weighted" | "front_weighted" | "milestone";
  cliffMonths: number;
  totalMonths: number;
  singleTrigger: boolean;
  doubleTrigger: boolean;
  status: "active" | "completed" | "terminated" | "accelerated";
}

export interface VestingSnapshot {
  month: number;
  date: string;
  sharesVested: number;
  cumulativeVested: number;
  percentVested: number;
  isCliff: boolean;
}

export function computeVestingTimeline(schedule: VestingSchedule): VestingSnapshot[] {
  const snapshots: VestingSnapshot[] = [];
  const { totalShares, cliffMonths, totalMonths, vestingType, grantDate } = schedule;
  const startDate = new Date(grantDate);
  let cumulative = 0;

  for (let month = 0; month <= totalMonths; month++) {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + month);
    let sharesThisMonth = 0;
    const isCliff = month === cliffMonths;

    if (month < cliffMonths) {
      sharesThisMonth = 0;
    } else if (month === cliffMonths) {
      sharesThisMonth = (totalShares / totalMonths) * cliffMonths;
    } else {
      const mid = totalMonths / 2;
      switch (vestingType) {
        case "linear":
          sharesThisMonth = totalShares / totalMonths;
          break;
        case "front_weighted":
          sharesThisMonth = month <= mid ? (totalShares * 1.5) / totalMonths : (totalShares * 0.5) / totalMonths;
          break;
        case "back_weighted":
          sharesThisMonth = month <= mid ? (totalShares * 0.5) / totalMonths : (totalShares * 1.5) / totalMonths;
          break;
        case "milestone":
          sharesThisMonth = totalShares / totalMonths;
          break;
      }
    }

    cumulative = Math.min(cumulative + sharesThisMonth, totalShares);
    snapshots.push({
      month,
      date: date.toISOString().split("T")[0],
      sharesVested: Math.round(sharesThisMonth * 100) / 100,
      cumulativeVested: Math.round(cumulative * 100) / 100,
      percentVested: Math.round((cumulative / totalShares) * 10000) / 100,
      isCliff,
    });
  }
  return snapshots;
}

export function getCurrentVested(schedule: VestingSchedule): { vested: number; percent: number; monthsElapsed: number } {
  const now = new Date();
  const start = new Date(schedule.grantDate);
  const monthsElapsed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

  if (schedule.status === "accelerated") return { vested: schedule.totalShares, percent: 100, monthsElapsed };
  if (schedule.status === "terminated") return { vested: schedule.vestedShares, percent: (schedule.vestedShares / schedule.totalShares) * 100, monthsElapsed };

  const timeline = computeVestingTimeline(schedule);
  const snap = timeline.find(s => s.month >= monthsElapsed) ?? timeline[timeline.length - 1];
  return { vested: snap.cumulativeVested, percent: snap.percentVested, monthsElapsed };
}

export function computeSharePrice(sviScore: number, authorizedShares: number): { priceAud: number; valuationAud: number } {
  const baseValuation = 100000;
  const delta = sviScore - 100;
  const valuationAud = Math.max(10000, baseValuation + (delta > 0 ? delta * 2000 : delta * 500));
  const priceAud = valuationAud / authorizedShares;
  return { priceAud: Math.round(priceAud * 10000) / 10000, valuationAud: Math.round(valuationAud) };
}
