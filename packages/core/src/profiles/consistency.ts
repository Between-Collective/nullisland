/* eslint-disable @typescript-eslint/no-explicit-any */
import { round, toWebMercator } from "../geo";
import { isoFromEpoch } from "./fields";
import { geohash } from "./spatial";
import type { RefineContext } from "./index";

/**
 * The agreements between columns that a field list cannot express.
 *
 * A schema can say a parcel row has `LAND_VAL`, `BLDG_VAL` and `TOTAL_VAL`. It
 * cannot say the third is the sum of the first two — and a fixture where it
 * isn't gets dismissed as broken by the wrong person for the wrong reason. The
 * whole idea here is that everything is right except the thing being tested,
 * so the arithmetic between columns has to hold before a problem comes along
 * and breaks it deliberately.
 *
 * Each hook runs after the fields are drawn, with the position the feature
 * actually landed on. Keys are named outright rather than sniffed for: these
 * are schemas, and a hook that quietly matches nothing is worse than none.
 */

type Props = Record<string, any>;

function num(value: any): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function secondsOf(value: any): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * ADS-B: one row is a snapshot of one aircraft, so the state vector has to
 * hang together — a jet on the stand is not doing 200 m/s, and the last
 * message of any kind cannot predate the last positional one.
 */
function refineAdsb(props: Props, ctx: RefineContext): void {
  const position = num(props.time_position);
  if (position !== null) props.last_contact = position + ctx.rng.int(0, 240);

  if (props.on_ground) {
    props.baro_altitude = 0;
    props.geo_altitude = null;
    props.velocity = round(ctx.rng.float(0, 12), 2);
    props.vertical_rate = 0;
    return;
  }
  const baro = num(props.baro_altitude);
  // GNSS altitude sits a couple of hundred metres off the barometric one,
  // because baro is referenced to 1013.25 hPa rather than to the ground.
  if (baro !== null) props.geo_altitude = round(baro + ctx.rng.gaussian(40, 90), 1);
}

/** AIS: what the bridge configured, against what the ship is actually doing. */
function refineAis(props: Props, ctx: RefineContext): void {
  const status = String(props.nav_status ?? "");
  if (status === "1" || status === "5") {
    props.sog = 0;
    props.rot = 0;
  }
  const heading = num(props.true_heading);
  const cog = num(props.cog);
  // A gyro-equipped vessel points within a few degrees of her track. 511 is
  // the "no gyro fitted" sentinel and is left exactly as it is.
  if (heading !== null && heading !== 511 && cog !== null && cog <= 360) {
    props.true_heading = Math.round((cog + ctx.rng.gaussian(0, 4) + 360) % 360);
  }
  if (num(props.sog) === 0) props.rot = 0;
}

/** Telematics: ignition off means stopped, and hours track distance. */
function refineTelematics(props: Props, ctx: RefineContext): void {
  if (props.ignition_state === false) {
    props.speed = 0;
    props.rpm = 0;
  } else {
    const speed = num(props.speed);
    // Idling at 800 rpm, and about 40 rpm per km/h in a working gear.
    if (speed !== null) props.rpm = Math.round(800 + speed * ctx.rng.float(28, 48));
  }
  const odometer = num(props.odometer_km);
  // Roughly 40 km per engine hour once idling is in the average.
  if (odometer !== null) props.engine_hours = round(odometer / ctx.rng.float(32, 52), 1);
}

/** GTFS: stops run in order along a trip, and distance grows with them. */
function refineTransit(props: Props, ctx: RefineContext): void {
  const sequence = (ctx.index % 40) + 1;
  props.stop_sequence = sequence;
  // shape_dist_traveled is cumulative along the shape, so it has to increase
  // with the sequence — the unit it is in is the thing nobody agrees on.
  props.shape_dist_traveled = round(sequence * ctx.rng.float(280, 900), 2);
  if (typeof props.stop_code === "string" && typeof props.stop_id === "string") {
    // The code on the flag at the roadside is not the id in the feed, which is
    // exactly why passengers quote one and the API wants the other.
    props.stop_code = props.stop_id.replace(/\D/g, "").slice(0, 5) || props.stop_code;
  }
}

/** MDS: an available vehicle is not on a trip, and range follows the battery. */
function refineMicromobility(props: Props, ctx: RefineContext): void {
  const state = String(props.vehicle_state ?? "");
  if (/available|reserved/i.test(state)) props.is_disabled = false;
  if (/removed|non_operational/i.test(state)) props.is_disabled = true;
  props.is_reserved = /reserved/i.test(state);

  const battery = num(props.battery_pct);
  if (battery !== null) {
    // Both scales are in the wild — a fraction in MDS, a percentage in the
    // operator feed behind it — so the range is derived from whichever this
    // row is using rather than from a guess about which it should be.
    const share = battery > 1 ? battery / 100 : battery;
    props.current_range_meters = Math.round(share * ctx.rng.float(18_000, 45_000));
  }
}

/** Ad pings: the index column is computed from the position, so it agrees. */
function refinePings(props: Props, ctx: RefineContext): void {
  const [lon, lat] = (ctx.position ?? [0, 0]) as [number, number];
  props.geo_hash = geohash(Number(lon), Number(lat), 7);

  // The id and its type have to describe each other: IDFA is upper-case, AAID
  // lower-case, and an opted-out row carries the zeroed id rather than a null.
  const id = props.ad_id;
  if (typeof id === "string" && id.length > 8) {
    if (props.id_type === "aaid") props.ad_id = id.toLowerCase();
    else if (props.id_type === "idfa") props.ad_id = id.toUpperCase();
  }
  if (props.lmt === 1) props.ad_id = "00000000-0000-0000-0000-000000000000";
}

/** Parcels: the assessment adds up, and a sale has a date if it has a price. */
function refineParcels(props: Props, ctx: RefineContext): void {
  const land = num(props.LAND_VAL);
  const building = num(props.BLDG_VAL);
  if (land !== null && building !== null) props.TOTAL_VAL = land + building;
  if (props.LS_DATE === null || props.LS_DATE === undefined) props.LS_PRICE = 0;
  else if (num(props.LS_PRICE) === 0 && ctx.rng.bool(0.5)) props.LS_DATE = null;
}

/** Footprints: storeys, roof height and ground elevation describe one building. */
function refineFootprints(props: Props, ctx: RefineContext): void {
  const height = num(props.HEIGHTROOF);
  // A storey is a little over three metres, and the ground floor of a
  // commercial block is taller — close enough that a reader can check.
  if (height !== null) props.NUM_FLOORS = Math.max(1, Math.round(height / ctx.rng.float(3, 4.2)));
  const built = num(props.CNSTRCT_YR);
  if (built !== null && built > 2026) props.CNSTRCT_YR = 2026;
}

/** Weather: dew point cannot exceed air temperature, and valid follows observed. */
function refineWeather(props: Props, ctx: RefineContext): void {
  const temp = num(props.air_temp);
  if (temp !== null) props.dew_point = round(temp - Math.abs(ctx.rng.gaussian(3, 2)), 1);
  const observed = secondsOf(props.obs_time);
  if (observed !== null) props.valid_time = isoFromEpoch(observed + ctx.rng.int(0, 3600));
  // Rain is why visibility drops, so the two are not independent draws.
  const precip = num(props.precip_accum_1hr);
  if (precip !== null && precip > 2) props.visibility = round(ctx.rng.float(0.2, 4), 1);
}

/** Scenes: processing happens after acquisition, and cover follows cloud. */
function refineScenes(props: Props): void {
  const cloud = num(props.cloud_cover);
  const coverage = num(props.data_coverage);
  if (cloud !== null && coverage !== null) {
    // A partial scene at the edge of a swath has less of everything in it.
    props.data_coverage = round(Math.max(coverage, 100 - cloud * 1.4), 1);
  }
  const gsd = num(props.gsd_m);
  if (gsd !== null && props.platform === "Sentinel-2B") props.gsd_m = 10;
}

/** Census: the margin follows the estimate, and the internal point is the point. */
function refineCensus(props: Props, ctx: RefineContext): void {
  const population = num(props.B01003_001E);
  // The margin of error runs about 5-15% of a tract-level estimate.
  if (population !== null) props.B01003_001M = Math.round(population * ctx.rng.float(0.05, 0.15));

  // INTPTLAT/INTPTLON are the tract's internal point, so they belong to this
  // polygon — as signed decimal degrees in a *string*, leading + and all.
  const [lon, lat] = (ctx.position ?? [0, 0]) as [number, number];
  if (typeof props.INTPTLAT === "string") {
    props.INTPTLAT = `${lat >= 0 ? "+" : "-"}${Math.abs(Number(lat)).toFixed(7)}`;
  }
  if (typeof props.INTPTLON === "string") {
    props.INTPTLON = `${lon >= 0 ? "+" : "-"}${Math.abs(Number(lon)).toFixed(7)}`;
  }
  // GEOID is state + county + tract, which is why it has leading zeros to lose.
  if (typeof props.STATEFP === "string" && typeof props.COUNTYFP === "string" && typeof props.TRACTCE === "string") {
    props.GEOID = `${props.STATEFP}${props.COUNTYFP}${props.TRACTCE}`;
    props.AFFGEOID = `1400000US${props.GEOID}`;
  }
}

/** Health: cases accumulate, the rate is derived, and reporting lags onset. */
function refineHealth(props: Props, ctx: RefineContext): void {
  const total = num(props.tot_cases);
  const fresh = num(props.new_case);
  if (total !== null && fresh !== null && fresh > total) props.new_case = Math.round(total * 0.05);
  const population = num(props.population);
  if (total !== null && population !== null && population > 0) {
    props.crude_rate = round((total / population) * 100_000, 1);
  }
  const onset = secondsOf(props.onset_dt);
  // Reporting lag is days, not minutes, and it is the reason a curve redraws
  // itself for a fortnight after the fact.
  if (onset !== null) props.cdc_report_dt = isoFromEpoch(onset + ctx.rng.int(86_400, 1_209_600));
  const beds = num(props.inpatient_beds_used_7_day_avg);
  if (beds !== null) props.inpatient_beds_used_7_day_sum = round(beds * 7, 1);
}

/** Incidents: updated after reported, and the projected columns are this point. */
function refineIncidents(props: Props, ctx: RefineContext): void {
  const occurred = secondsOf(props.date);
  if (occurred !== null) props.updated_on = isoFromEpoch(occurred + ctx.rng.int(3600, 2_592_000));

  // x/y are the same location in the agency's projected system. Keeping them
  // consistent is what makes "the two disagree" worth testing for later.
  const [lon, lat] = (ctx.position ?? [0, 0]) as [number, number];
  if (num(props.x_coordinate) !== null) {
    const [x, y] = toWebMercator(Number(lon), Number(lat));
    props.x_coordinate = round(x, 1);
    props.y_coordinate = round(y, 1);
  }
}

/**
 * Which data types have cross-field arithmetic worth holding to. The rest are
 * honest as independent draws.
 */
export const CONSISTENCY: Record<string, (props: Props, ctx: RefineContext) => void> = {
  "flight-adsb": refineAdsb,
  "maritime-ais": refineAis,
  "fleet-telematics": refineTelematics,
  "transit-gtfs": refineTransit,
  "micromobility-mds": refineMicromobility,
  "mobile-location-pings": refinePings,
  "cadastral-parcels": refineParcels,
  "building-footprints": refineFootprints,
  "weather-observations": refineWeather,
  "satellite-scene-footprints": refineScenes,
  "census-boundary": refineCensus,
  "health-epidemiology": refineHealth,
  "crime-incident": refineIncidents,
};
