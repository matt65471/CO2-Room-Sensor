# CO2 Room Sensor

An ESP32-S3 + SCD41 sensor that measures room CO2 and uploads readings to Supabase, plus an app to view the data.

| Folder | What it is |
|---|---|
| [`firmware/`](firmware/) | ESP-IDF project for the ESP32-S3 (sensor, Wi-Fi, device ID, Supabase upload) |
| [`supabase/`](supabase/) | Database schema and setup instructions |
| [`app/`](app/) | Dashboard: React frontend + Node.js backend for viewing readings |

## Firmware quick start

```bash
cd firmware
source ~/.espressif/tools/activate_idf_v6.1.sh
idf.py menuconfig                                  # Wi-Fi + Supabase settings
idf.py -p /dev/cu.usbmodem101 flash monitor
```

In VS Code, open `CO2-Room-Sensor.code-workspace` (or just the `firmware/` folder) so the ESP-IDF extension finds the project.

Secrets (Wi-Fi password, Supabase key) live in `firmware/sdkconfig`, which is git-ignored. Shared, non-secret settings go in `firmware/sdkconfig.defaults`.

## App quick start

1. In Supabase's SQL Editor, run [`supabase/app_queries.sql`](supabase/app_queries.sql) (once, after `schema.sql`).
2. Copy `app/backend/.env.example` to `app/backend/.env` and fill in the Project URL and the **secret** key.
   The secret key stays on the backend only; `.env` is git-ignored.
3. Run:

```bash
cd app
npm install
npm run dev        # backend on :3001, frontend on http://localhost:5173
```

Other commands: `npm test` (backend unit tests), `npm run build` (type-check and build both).

## App layout

```
app/backend/src/
  index.ts              Express server
  routes/               HTTP endpoints, grouped by the part of the app that uses them
    devices.ts            GET /devices (sensor picker)
    dashboard.ts          GET /readings, /summary (Consumer Dashboard)
    history.ts            GET /history/readings, /history/stats (Data Analysis charts and tables)
    roomModel.ts          GET /history/room-model (λ, G_est and its labels)
    http.ts               request validation and error responses
  db/                   Supabase client and queries
  analysis/             Consumer Dashboard maths: CO₂ trend, graph point widths
  roomModel/            The room model: λ (lambda.ts), G_est (gest.ts), labels (occupancy.ts),
                        which data it learns from (lookback.ts)
app/backend/tests/      Unit tests, in the same folders as the code they test (npm test)

app/frontend/src/
  App.tsx               header, sensor picker, °C/°F, and the switch between the two dashboards
  api/                  response types (types.ts) and fetch calls (client.ts)
  lib/                  measurement names, units and formatting; saved preferences
  charts/               chart helpers shared by both dashboards
  dashboards/consumer/  Consumer Dashboard and its components
  dashboards/analysis/  Data Analysis tab and its components
    roomModel/            λ summary, decay list, legends and colours for the room model
  styles/               base.css (shared), consumer.css, analysis.css
```

## How the room model works

The Data Analysis tab estimates how quickly the room exchanges air with the outside. This is the first
step towards classifying what is happening in the room (empty, someone present, asleep, window open)
from CO₂ alone.

### The equation

Treat the room as one box of evenly mixed air:

| Symbol | Meaning | Units |
|---|---|---|
| `V` | Room volume | m³ |
| `C` | CO₂ concentration in the room | ppm |
| `C_out` | CO₂ concentration of the air coming in (outdoors / rest of the house) | ppm |
| `Q` | Airflow through the room (the same amount comes in as goes out) | m³/h |
| `E` | CO₂ breathed out by the people in the room | m³ CO₂/h |

The amount of CO₂ in the room is `V·C`. It changes by what comes in minus what goes out:

```
V · dC/dt  =  E          +  Q·C_out          −  Q·C
              breathed      carried in by       carried out by
              out           fresh air           room air
```

The fresh-air term is *positive*: outdoor air still contains about 420 ppm of CO₂, so it brings some in.
Ventilation lowers CO₂ because the two airflow terms together, `Q·C_out − Q·C = −Q·(C − C_out)`, are
negative whenever the room is above outdoor levels. The air leaving carries more CO₂ than the air
arriving. This is also why an aired-out room settles at `C_out`, not at zero.

Divide by `V`:

```
dC/dt = G − λ·(C − C_out)

λ = Q/V   air-change rate: room volumes of fresh air per hour       (1/h)
G = E/V   how fast the people in the room push the CO₂ level up    (ppm/h)
```

In words: CO₂ rises with whatever people breathe out and falls in proportion to how far above outdoor
levels the room is.

### Estimating G, and why it matters

Solving the same equation for the one thing we can't measure directly:

```
G_est = dC/dt + λ·(C − C_out)
```

| Input | Where it comes from |
|---|---|
| `C` | Measured by the sensor every minute |
| `dC/dt` | Slope of a straight-line fit over 15–20 minutes. The minute-to-minute slope is too noisy |
| `C_out` | The 2nd percentile of the past week's readings: the level the room reaches when fully aired out |
| `λ` | Learned from empty-room decays (below) |

Slope alone can't tell you whether anyone is in the room:

- **Flat CO₂ can mean either state.** CO₂ flat at 450 ppm means an empty room. Flat at 900 ppm means someone is there and their
  breathing exactly balances the ventilation. Both have `dC/dt = 0`.
- **A fall isn't always someone leaving.** After someone leaves, CO₂ falls quickly at first and then slowly. That's the room airing out,
  not a change in the people. A fall can also just mean someone fell asleep and is breathing less.

`G_est` removes the ventilation part and leaves only what the occupants contribute. `G_est ≈ 0` means
the room is empty, whatever the CO₂ level. A resting adult adds about 0.3 L of CO₂ per minute (about
600 ppm/h in a 30 m³ room), and somewhat less when asleep, so `G_est` also says roughly how many people
are there and whether they are asleep. You never need the room's volume, because `G` is already per volume.

### Measuring λ

With nobody in the room `G = 0`, and the equation becomes an exponential decay towards outdoor levels:

```
C(t) = C_out + (C₀ − C_out) · e^(−λt)      so      ln(C − C_out) falls in a straight line with slope −λ
```

The backend ([`app/backend/src/roomModel/lambda.ts`](app/backend/src/roomModel/lambda.ts)) does this automatically:

1. Average the readings into 5-minute points and take `C_out` as their 2nd percentile.
2. Find every stretch where CO₂ keeps falling (small upticks under 20 ppm count as noise), at least 45 minutes long,
   starting 200+ ppm above baseline and falling 150+ ppm.
3. Fit `ln(C − C_out)` against time, using only points 60+ ppm above baseline. Closer in, a small error in
   `C_out` would dominate.
4. Decide whether the room was **empty or occupied** during the fall (see "Heading to" below). Only
   empty-room falls can be used to measure λ.
5. Keep empty-room falls that follow a clean exponential (R² ≥ 0.95). A fall more than 2.5× faster than
   usual is a door or window opening, not the room's normal air exchange. λ is the median of what's left.

#### "Heading to": was the room empty or occupied during a fall?

CO₂ falls in two different situations, and they look alike at first:

| | Someone leaves | Someone falls asleep |
|---|---|---|
| Example from this room | Morning, 1000 → 430 ppm | 1–3 a.m., 1130 → 830 ppm |
| Is anyone still adding CO₂? | No | Yes, just less than before |
| Usable for λ? | **Yes** | **No**: it would make λ about 10× too small |

The difference is in the **shape** of the fall:

- **Empty room:** CO₂ keeps decreasing exponentially, curving down towards `C_out`. Nothing is adding CO₂,
  so the excess keeps shrinking by the same fraction every hour until it is gone.
- **Occupied room:** CO₂ **flattens out** above `C_out`, at the level where the CO₂ the occupants still breathe
  out balances what ventilation removes (`C_out + G/λ`).

To tell them apart, the backend fits `C = C_eq + A·e^(−λt)` to the fall without assuming where it ends,
and reads off `C_eq`, the level the curve flattens out at. That is the **Heading to** value on the dashboard:

| Heading to | Verdict |
|---|---|
| Within 100 ppm of `C_out` | Was still decreasing exponentially: **room empty**, λ used |
| More than 100 ppm above `C_out` | Was flattening out: **room occupied**, λ not used |
| Can't be worked out (fall too short to show any curve) | Too short to judge, λ not used |

Why not just check where the fall ended? Falls are often cut short when someone comes back in, so the end
point only shows *when* that happened. On Nov 11, CO₂ fell 870 → 600 ppm and then rose again. Ending at
600 (164 ppm above baseline) looks occupied. But it was still decreasing steeply, not flattening, and its
curve heads to 481 ppm, so the room was empty until someone came back.

This also points to a later use: a fall whose curve was heading to baseline but which ended well above it
means **someone re-entered** at the moment it ended. The dashboard doesn't flag that yet.

The estimate always uses at least 7 days of data, since one day usually has only one or two empty periods.
For a shorter window, those 7 days are **centred on the window** (e.g. Nov 10–11 learns from about Nov 7–14),
so the model learns from the days closest to it on both sides. When the days after the window don't exist
yet, such as for "Last 24 h", it falls back to the 7 days ending at the window's end. Windows of 7–60 days
are used as they are, and longer ones are capped to their last 60 days. The same data is used for λ and for
the `G_est` labels below.
The Data Analysis tab shows λ, how long the excess CO₂ takes to halve (`ln 2 / λ`), the baseline, and
every fall considered. Falls are shaded on the CO₂ chart by verdict.

On this room's first week of data: `C_out` ≈ 436 ppm and λ ≈ 1.0 per hour (12 empty-room decays). That's
about one full air change per hour, so the excess CO₂ halves roughly every 42 minutes once the room is empty.

### G_est on the dashboard

With λ and `C_out` known, the backend ([`app/backend/src/roomModel/gest.ts`](app/backend/src/roomModel/gest.ts)) computes
`G_est` for every 5-minute point in the chosen window. `dC/dt` is the slope of a straight line through the
readings 10 minutes either side of the point, and `C` is their mean. The Data Analysis tab plots it as its
own chart, below humidity, with λ and the baseline beside it.

On this room's first week, by time of day:

| Period | Median G_est | Middle 50% | What's happening |
|---|---|---|---|
| 12:00–16:00 | 13 ppm/h | −7 to 40 | Out: empty room, ≈ 0 as expected |
| 02:00–08:00 | 442 ppm/h | 402 to 499 | Asleep: steady |
| 20:00–24:00 | 674 ppm/h | 425 to 793 | Awake: higher and more variable |

`G_est` measures the total CO₂ being added, so two people give about twice the value. That makes
"empty or not" reliable regardless of headcount, but means "2 people asleep" and "1 person awake" can look
similar by `G_est` alone. The planned classifier will also use how steady `G_est` is, the time of night,
and temperature and humidity, not just its size.


### TODO: live mode

Not built yet. The goal is to show, on the Consumer Dashboard, whether someone is in the room *right now*.

**How it would work.** Every minute (the sensor uploads once a minute and the Consumer Dashboard already
refreshes once a minute):

1. Take the **last 15 minutes of raw 1-minute readings**. Don't use 5-minute blocks: the newest block is
   always partly filled, and the 1-minute readings give the slope more points.
2. Fit a straight line through them. Its slope is `dC/dt`, and their mean is `C`.
3. `G_est = dC/dt + λ·(C − C_out)`, using the λ and `C_out` already learned from the past week.
4. Show `G_est` and a label: **Room empty** if it is below about 150 ppm/h, otherwise **Someone in the room**.

**What to expect:**
- **Lag:** a line through the last 15 minutes describes the middle of that window, so the estimate is
  about **7 minutes behind**. If someone leaves at 10:00, it should read "empty" by about 10:10–10:15.
  Any slope needs a few minutes of readings, so this lag can't be removed entirely.
- **Noise:** with 15 readings of about ±8.5 ppm each, `G_est` should be good to about ±30 ppm/h. That is
  small next to the gaps between states in this room: about 0 when empty, about 440 asleep, and
  about 670 awake.
- **λ doesn't need to be live.** It barely changes, so recompute it at most once an hour and cache it.
  The "empty-room fall" verdicts it comes from only work in hindsight anyway.

**Pieces to build:**
- **Backend.** A `GET /api/live?device=` endpoint, in a new `app/backend/src/routes/live.ts`, that:
  - fetches the last 15 minutes of readings;
  - gets λ and `C_out` from `estimateLambda` (`app/backend/src/roomModel/lambda.ts`), cached per device for an hour;
  - returns the latest CO₂, `G_est`, the number of readings used, and the label.
- **Calculation.** A backward-only version of `computeGest` in `app/backend/src/roomModel/gest.ts`. It can reuse
  the existing least-squares slope (`slopeAndMean`).
- **Frontend.** Show `G_est` and the label in the Consumer Dashboard's top card
  (`app/frontend/src/dashboards/consumer/TrendCard.tsx`), fetched on the existing one-minute refresh.
- **Tests.** Simulated data like `gest.test.ts`: after someone arrives or leaves, the label should flip
  within about 15 minutes.

**Edge cases:**
- **Too few recent readings** (fewer than about 10 in the last 15 minutes, e.g. the sensor was offline):
  show "No recent data" rather than a guess.
- **No λ yet** (no clean empty-room fall in the past week): hide the live estimate and say why.

**Later:** telling *asleep* from *awake* needs more than one number. It would use how steady `G_est` has
been over the past hour or more, the time of night, and temperature and humidity. That belongs in the
classifier, with the dashed event lines on the charts.

### Assumptions

The model assumes evenly mixed air, a steady λ (doors and windows change it), a steady `C_out`, and no
other CO₂ sources such as a gas stove or a candle.
