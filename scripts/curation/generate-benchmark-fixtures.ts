import fs from 'node:fs';
import path from 'node:path';

export interface BenchmarkHeadlinePair {
  id: string;
  headlineA: string;
  headlineB: string;
  entitiesA: string[];
  entitiesB: string[];
  pubDateA: string;
  pubDateB: string;
  language: 'en' | 'hi';
  category: 'same_event' | 'different_event' | 'round_conflict' | 'temporal_conflict' | 'disjoint_entity';
  expectedMerge: boolean;
}

// Pseudo-random generator with seed
function sfc32(a: number, b: number, c: number, d: number) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

function stringToSeed(str: string): [number, number, number, number] {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x811c9dc5, h4 = 0x1000193;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 2246822507);
    h4 = Math.imul(h4 ^ ch, 3266489909);
  }
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function generateRandomUnitVector(seedStr: string, dimensions = 1024): Float64Array {
  const [a, b, c, d] = stringToSeed(seedStr);
  const rand = sfc32(a, b, c, d);
  const vec = new Float64Array(dimensions);
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    // Box-Muller transform
    const u1 = Math.max(1e-10, rand());
    const u2 = rand();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    vec[i] = z;
    norm += z * z;
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < dimensions; i++) {
    vec[i] /= norm;
  }
  return vec;
}

function combineVectors(
  baseVec: Float64Array,
  indepVec: Float64Array,
  baseWeight: number,
  indepWeight: number,
  dimensions = 1024
): number[] {
  const res = new Float64Array(dimensions);
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    const v = baseWeight * baseVec[i] + indepWeight * indepVec[i];
    res[i] = v;
    norm += v * v;
  }
  norm = Math.sqrt(norm);
  const out = new Array<number>(dimensions);
  for (let i = 0; i < dimensions; i++) {
    out[i] = Number((res[i] / norm).toFixed(6));
  }
  return out;
}

// Curate the 210 benchmark pairs
export function createBenchmarkPairs(): BenchmarkHeadlinePair[] {
  const pairs: BenchmarkHeadlinePair[] = [];
  let idCounter = 1;
  const nextId = (prefix: string) => `${prefix}-${String(idCounter++).padStart(3, '0')}`;

  // 1. same_event: 90 pairs (expectedMerge: true)
  // UK (12)
  pairs.push(
    {
      id: nextId('SE-UK'),
      headlineA: 'Bank of England cuts interest rate to 4.75 percent',
      headlineB: 'BoE reduces benchmark interest rate by 25 basis points to 4.75%',
      entitiesA: ['bank-of-england', 'andrew-bailey'],
      entitiesB: ['bank-of-england'],
      pubDateA: '2026-10-21T12:00:00.000Z',
      pubDateB: '2026-10-21T12:15:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-UK'),
      headlineA: 'Keir Starmer announces major NHS reform package in London speech',
      headlineB: 'Prime Minister Keir Starmer unveils long-term recovery plan for NHS',
      entitiesA: ['keir-starmer', 'nhs'],
      entitiesB: ['keir-starmer', 'nhs'],
      pubDateA: '2026-10-21T09:00:00.000Z',
      pubDateB: '2026-10-21T09:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-UK'),
      headlineA: 'State Opening of Parliament sees King Charles deliver government agenda',
      headlineB: 'King Charles delivers address at State Opening of Parliament in London',
      entitiesA: ['king-charles', 'parliament'],
      entitiesB: ['king-charles', 'parliament'],
      pubDateA: '2026-10-21T11:00:00.000Z',
      pubDateB: '2026-10-21T11:20:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-UK'),
      headlineA: 'Chancellor Rachel Reeves presents autumn budget to House of Commons',
      headlineB: 'Rachel Reeves delivers landmark autumn budget tax and spending plans',
      entitiesA: ['rachel-reeves'],
      entitiesB: ['rachel-reeves'],
      pubDateA: '2026-10-21T13:30:00.000Z',
      pubDateB: '2026-10-21T13:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-UK'),
      headlineA: 'London Gatwick airport reopens runway following drone investigation',
      headlineB: 'Flights resume at Gatwick airport after suspected drone disruption',
      entitiesA: ['gatwick-airport'],
      entitiesB: ['gatwick-airport'],
      pubDateA: '2026-10-21T07:15:00.000Z',
      pubDateB: '2026-10-21T07:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-UK'),
      headlineA: 'BBC confirms major newsroom restructuring and digital shift',
      headlineB: 'Broadcaster BBC announces operational restructuring across news operations',
      entitiesA: ['bbc'],
      entitiesB: ['bbc'],
      pubDateA: '2026-10-21T14:00:00.000Z',
      pubDateB: '2026-10-21T14:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-UK'),
      headlineA: 'Metropolitan Police arrest three after climate protest in central London',
      headlineB: 'Three activists detained by Met Police during London environmental protest',
      entitiesA: ['met-police'],
      entitiesB: ['met-police'],
      pubDateA: '2026-10-21T15:10:00.000Z',
      pubDateB: '2026-10-21T15:40:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-UK'),
      headlineA: 'UK inflation falls to 1.7 percent in surprise drop below target',
      headlineB: 'British inflation slows unexpectedly to 1.7% in latest ONS figures',
      entitiesA: ['ons', 'inflation'],
      entitiesB: ['ons'],
      pubDateA: '2026-10-21T07:00:00.000Z',
      pubDateB: '2026-10-21T07:20:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-UK'),
      headlineA: 'Storm Ashley causes widespread travel disruption and power cuts in Scotland',
      headlineB: 'Severe gales from Storm Ashley disrupt flights and trains across Scotland',
      entitiesA: ['storm-ashley', 'scotland'],
      entitiesB: ['storm-ashley'],
      pubDateA: '2026-10-21T16:00:00.000Z',
      pubDateB: '2026-10-21T16:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-UK'),
      headlineA: 'High Speed 2 rail link to London Euston confirmed by Transport Secretary',
      headlineB: 'Government approves funding for HS2 terminus extension into central Euston',
      entitiesA: ['hs2', 'euston'],
      entitiesB: ['hs2'],
      pubDateA: '2026-10-21T10:15:00.000Z',
      pubDateB: '2026-10-21T10:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-UK'),
      headlineA: 'British Museum unveils masterplan for major historic gallery restoration',
      headlineB: 'British Museum announces international competition to redesign landmark galleries',
      entitiesA: ['british-museum'],
      entitiesB: ['british-museum'],
      pubDateA: '2026-10-21T11:45:00.000Z',
      pubDateB: '2026-10-21T12:15:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-UK'),
      headlineA: 'Tata Steel confirms permanent shutdown of Port Talbot blast furnace',
      headlineB: 'End of traditional steelmaking as Tata closes final blast furnace in Wales',
      entitiesA: ['tata-steel', 'port-talbot'],
      entitiesB: ['tata-steel'],
      pubDateA: '2026-10-21T08:30:00.000Z',
      pubDateB: '2026-10-21T09:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    }
  );

  // US (12)
  pairs.push(
    {
      id: nextId('SE-US'),
      headlineA: 'Federal Reserve holds interest rates steady after policy meeting',
      headlineB: 'Fed leaves benchmark interest rate unchanged at latest policy session',
      entitiesA: ['federal-reserve', 'jerome-powell'],
      entitiesB: ['federal-reserve'],
      pubDateA: '2026-10-21T18:00:00.000Z',
      pubDateB: '2026-10-21T18:15:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-US'),
      headlineA: 'Supreme Court agrees to hear major social media free speech appeal',
      headlineB: 'US Supreme Court takes up landmark First Amendment tech regulation case',
      entitiesA: ['supreme-court'],
      entitiesB: ['supreme-court'],
      pubDateA: '2026-10-21T14:30:00.000Z',
      pubDateB: '2026-10-21T15:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-US'),
      headlineA: 'Fast-moving wildfire prompts evacuation orders across Northern California',
      headlineB: 'Butte County wildfire burns thousands of acres and threatens homes in California',
      entitiesA: ['california', 'wildfire'],
      entitiesB: ['california'],
      pubDateA: '2026-10-21T04:00:00.000Z',
      pubDateB: '2026-10-21T04:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-US'),
      headlineA: 'NASA Artemis II astronauts complete final lunar flyby simulations',
      headlineB: 'Astronauts complete crucial launch training ahead of NASA Artemis II mission',
      entitiesA: ['nasa', 'artemis'],
      entitiesB: ['nasa', 'artemis'],
      pubDateA: '2026-10-21T16:20:00.000Z',
      pubDateB: '2026-10-21T17:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-US'),
      headlineA: 'Boeing reaches tentative contract agreement with striking machinists union',
      headlineB: 'Boeing and union negotiate proposal aimed at ending weeks-long factory strike',
      entitiesA: ['boeing'],
      entitiesB: ['boeing'],
      pubDateA: '2026-10-21T01:30:00.000Z',
      pubDateB: '2026-10-21T02:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-US'),
      headlineA: 'Department of Justice files antitrust suit against major healthcare merger',
      headlineB: 'DOJ sues to block hospital network acquisition citing competition concerns',
      entitiesA: ['doj'],
      entitiesB: ['doj'],
      pubDateA: '2026-10-21T17:45:00.000Z',
      pubDateB: '2026-10-21T18:10:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-US'),
      headlineA: 'Hurricane Milton makes landfall on Florida coast with catastrophic winds',
      headlineB: 'Monster storm Hurricane Milton roars ashore near Tampa Bay Florida',
      entitiesA: ['hurricane-milton', 'florida'],
      entitiesB: ['hurricane-milton', 'florida'],
      pubDateA: '2026-10-21T02:15:00.000Z',
      pubDateB: '2026-10-21T02:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-US'),
      headlineA: 'Tesla unveils driverless cybercab prototype at Hollywood event',
      headlineB: 'Elon Musk showcases autonomous robotaxi at Tesla product demonstration',
      entitiesA: ['tesla', 'elon-musk'],
      entitiesB: ['tesla', 'elon-musk'],
      pubDateA: '2026-10-21T05:30:00.000Z',
      pubDateB: '2026-10-21T06:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-US'),
      headlineA: 'US employers add 254000 jobs in September beating Wall Street expectations',
      headlineB: 'US job growth surges in September as unemployment rate dips to 4.1 percent',
      entitiesA: ['us-economy', 'jobs'],
      entitiesB: ['us-economy'],
      pubDateA: '2026-10-21T12:30:00.000Z',
      pubDateB: '2026-10-21T12:50:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-US'),
      headlineA: 'Apple introduces redesigned iPad mini featuring enhanced AI processor',
      headlineB: 'Apple updates compact iPad mini with A17 Pro chip and Apple Intelligence',
      entitiesA: ['apple', 'ipad'],
      entitiesB: ['apple', 'ipad'],
      pubDateA: '2026-10-21T13:00:00.000Z',
      pubDateB: '2026-10-21T13:20:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-US'),
      headlineA: 'SpaceX successfully catches Starship booster with mechanical arms on pad',
      headlineB: 'SpaceX achieves historic engineering feat catching Starship booster mid-air',
      entitiesA: ['spacex', 'starship'],
      entitiesB: ['spacex', 'starship'],
      pubDateA: '2026-10-21T14:15:00.000Z',
      pubDateB: '2026-10-21T14:35:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-US'),
      headlineA: 'Treasury Secretary Janet Yellen warns of global supply chain vulnerabilities',
      headlineB: 'Janet Yellen addresses economic forum on international supply chain resilience',
      entitiesA: ['janet-yellen'],
      entitiesB: ['janet-yellen'],
      pubDateA: '2026-10-21T15:30:00.000Z',
      pubDateB: '2026-10-21T16:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    }
  );

  // AU (12)
  pairs.push(
    {
      id: nextId('SE-AU'),
      headlineA: 'Reserve Bank of Australia leaves official cash rate unchanged at 4.35%',
      headlineB: 'RBA holds interest rate steady as inflation pressures remain elevated',
      entitiesA: ['rba', 'michele-bullock'],
      entitiesB: ['rba'],
      pubDateA: '2026-10-21T03:30:00.000Z',
      pubDateB: '2026-10-21T03:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-AU'),
      headlineA: 'Anthony Albanese pledges major funding for Australian clean energy projects',
      headlineB: 'Prime Minister Anthony Albanese unveils green energy investment scheme in Canberra',
      entitiesA: ['anthony-albanese'],
      entitiesB: ['anthony-albanese'],
      pubDateA: '2026-10-21T01:00:00.000Z',
      pubDateB: '2026-10-21T01:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-AU'),
      headlineA: 'Sydney train commuters endure severe delays after major signal failure',
      headlineB: 'Communication failure halts Sydney rail network causing widespread disruption',
      entitiesA: ['sydney-trains'],
      entitiesB: ['sydney-trains'],
      pubDateA: '2026-10-21T21:00:00.000Z',
      pubDateB: '2026-10-21T21:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-AU'),
      headlineA: 'Scientists document mass coral bleaching across Great Barrier Reef waters',
      headlineB: 'Marine survey confirms extensive coral bleaching across Great Barrier Reef',
      entitiesA: ['great-barrier-reef'],
      entitiesB: ['great-barrier-reef'],
      pubDateA: '2026-10-21T04:20:00.000Z',
      pubDateB: '2026-10-21T04:50:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-AU'),
      headlineA: 'BHP settles landmark environmental damages claim over Brazilian dam collapse',
      headlineB: 'Mining giant BHP agrees multi-billion settlement for Mariana dam disaster',
      entitiesA: ['bhp'],
      entitiesB: ['bhp'],
      pubDateA: '2026-10-21T06:10:00.000Z',
      pubDateB: '2026-10-21T06:40:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-AU'),
      headlineA: 'High Court of Australia delivers landmark ruling on native title compensation',
      headlineB: 'High Court upholds compensation entitlement for traditional indigenous land owners',
      entitiesA: ['high-court-australia'],
      entitiesB: ['high-court-australia'],
      pubDateA: '2026-10-21T02:00:00.000Z',
      pubDateB: '2026-10-21T02:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-AU'),
      headlineA: 'Qantas reports record passenger volumes as international travel surges',
      headlineB: 'Airline Qantas posts robust profit following strong post-pandemic flight demand',
      entitiesA: ['qantas'],
      entitiesB: ['qantas'],
      pubDateA: '2026-10-21T00:45:00.000Z',
      pubDateB: '2026-10-21T01:15:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-AU'),
      headlineA: 'Queensland state election campaign enters final stretch as leaders debate',
      headlineB: 'Queensland premier and opposition leader clash in televised election forum',
      entitiesA: ['queensland', 'election'],
      entitiesB: ['queensland'],
      pubDateA: '2026-10-21T08:00:00.000Z',
      pubDateB: '2026-10-21T08:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-AU'),
      headlineA: 'Melbourne property auction clearance rate rises as spring selling begins',
      headlineB: 'Melbourne housing market sees solid auction results across inner suburbs',
      entitiesA: ['melbourne', 'housing'],
      entitiesB: ['melbourne'],
      pubDateA: '2026-10-21T07:15:00.000Z',
      pubDateB: '2026-10-21T07:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-AU'),
      headlineA: 'Canberra parliament passes tough legislation curbing social media for minors',
      headlineB: 'Federal government moves ahead with minimum age limit for social media platforms',
      entitiesA: ['canberra', 'social-media'],
      entitiesB: ['canberra'],
      pubDateA: '2026-10-21T05:00:00.000Z',
      pubDateB: '2026-10-21T05:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-AU'),
      headlineA: 'Australia to acquire long-range Tomahawk missiles from United States',
      headlineB: 'Defence department finalises procurement of Tomahawk cruise missile arsenal',
      entitiesA: ['australian-defence'],
      entitiesB: ['australian-defence'],
      pubDateA: '2026-10-21T03:00:00.000Z',
      pubDateB: '2026-10-21T03:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-AU'),
      headlineA: 'Emergency services battle out-of-control bushfire in Western Australia hills',
      headlineB: 'Perth bushfire prompts emergency warnings as winds fan scrub flames',
      entitiesA: ['western-australia', 'bushfire'],
      entitiesB: ['western-australia'],
      pubDateA: '2026-10-21T09:15:00.000Z',
      pubDateB: '2026-10-21T09:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    }
  );

  // CA (12)
  pairs.push(
    {
      id: nextId('SE-CA'),
      headlineA: 'Bank of Canada lowers policy interest rate by 50 basis points to 3.75%',
      headlineB: 'BoC accelerates monetary easing with half-percentage-point interest rate cut',
      entitiesA: ['bank-of-canada', 'tiff-macklem'],
      entitiesB: ['bank-of-canada'],
      pubDateA: '2026-10-21T13:45:00.000Z',
      pubDateB: '2026-10-21T14:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-CA'),
      headlineA: 'Environment Canada issues widespread air quality warnings across Ontario',
      headlineB: 'Smoke from northern forest fires triggers smog advisories in Ontario cities',
      entitiesA: ['environment-canada', 'ontario'],
      entitiesB: ['environment-canada'],
      pubDateA: '2026-10-21T11:00:00.000Z',
      pubDateB: '2026-10-21T11:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-CA'),
      headlineA: 'Federal government tables new housing affordability legislation in Ottawa',
      headlineB: 'Ottawa introduces bill designed to remove development barriers for homebuilders',
      entitiesA: ['ottawa', 'housing'],
      entitiesB: ['ottawa'],
      pubDateA: '2026-10-21T15:00:00.000Z',
      pubDateB: '2026-10-21T15:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-CA'),
      headlineA: 'Justin Trudeau survives parliamentary confidence vote tabled by Conservatives',
      headlineB: 'Liberal government defeats opposition motion of no confidence in House of Commons',
      entitiesA: ['justin-trudeau', 'commons'],
      entitiesB: ['justin-trudeau'],
      pubDateA: '2026-10-21T19:30:00.000Z',
      pubDateB: '2026-10-21T20:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-CA'),
      headlineA: 'British Columbia election results show razor-thin contest between NDP and Tories',
      headlineB: 'Recount underway in closely fought British Columbia general provincial election',
      entitiesA: ['british-columbia', 'election'],
      entitiesB: ['british-columbia'],
      pubDateA: '2026-10-21T06:00:00.000Z',
      pubDateB: '2026-10-21T06:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-CA'),
      headlineA: 'Port of Montreal longshore workers reject maritime employers offer in vote',
      headlineB: 'Dockworkers in Montreal vote overwhelmingly to reject latest contract offer',
      entitiesA: ['montreal-port'],
      entitiesB: ['montreal-port'],
      pubDateA: '2026-10-21T16:15:00.000Z',
      pubDateB: '2026-10-21T16:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-CA'),
      headlineA: 'Canada announces major reduction in temporary foreign worker program intake',
      headlineB: 'Immigration minister outlines tighter limits on low-wage temporary foreign permits',
      entitiesA: ['immigration-canada'],
      entitiesB: ['immigration-canada'],
      pubDateA: '2026-10-21T17:00:00.000Z',
      pubDateB: '2026-10-21T17:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-CA'),
      headlineA: 'Toronto Transit Commission opens newest light rail transit line to passengers',
      headlineB: 'TTC welcomes commuters as Eglinton Crosstown transit extension begins service',
      entitiesA: ['toronto-transit'],
      entitiesB: ['toronto-transit'],
      pubDateA: '2026-10-21T10:00:00.000Z',
      pubDateB: '2026-10-21T10:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-CA'),
      headlineA: 'Air Canada pilots ratify four-year collective agreement with substantial pay raise',
      headlineB: 'Pilots union approves historic contract deal with carrier Air Canada',
      entitiesA: ['air-canada'],
      entitiesB: ['air-canada'],
      pubDateA: '2026-10-21T18:30:00.000Z',
      pubDateB: '2026-10-21T19:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-CA'),
      headlineA: 'Supreme Court of Canada clarifies indigenous rights under clean energy projects',
      headlineB: 'Top court affirms duty to consult First Nations regarding major resource pipelines',
      entitiesA: ['supreme-court-canada', 'first-nations'],
      entitiesB: ['supreme-court-canada'],
      pubDateA: '2026-10-21T14:15:00.000Z',
      pubDateB: '2026-10-21T14:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-CA'),
      headlineA: 'Alberta announces plans for provincial sovereign wealth fund expansion',
      headlineB: 'Premier Danielle Smith pledges to grow Alberta Heritage Fund to 250 billion',
      entitiesA: ['alberta', 'danielle-smith'],
      entitiesB: ['alberta'],
      pubDateA: '2026-10-21T20:15:00.000Z',
      pubDateB: '2026-10-21T20:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-CA'),
      headlineA: 'Statistics Canada reports annual inflation rate decelerated to 1.6 percent',
      headlineB: 'Canadian consumer price index rises 1.6% in September marking smallest gain in years',
      entitiesA: ['statcan', 'inflation'],
      entitiesB: ['statcan'],
      pubDateA: '2026-10-21T12:30:00.000Z',
      pubDateB: '2026-10-21T12:55:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    }
  );

  // IE (12)
  pairs.push(
    {
      id: nextId('SE-IE'),
      headlineA: 'Irish general election called as Taoiseach Simon Harris dissolves Dail',
      headlineB: 'Taoiseach Simon Harris confirms general election date following Dail dissolution',
      entitiesA: ['simon-harris', 'dail'],
      entitiesB: ['simon-harris'],
      pubDateA: '2026-10-21T12:00:00.000Z',
      pubDateB: '2026-10-21T12:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IE'),
      headlineA: 'Central Bank of Ireland raises domestic economic growth forecast for 2025',
      headlineB: 'CBI upgrades Irish GDP outlook citing robust multinational exports and employment',
      entitiesA: ['central-bank-ireland'],
      entitiesB: ['central-bank-ireland'],
      pubDateA: '2026-10-21T09:30:00.000Z',
      pubDateB: '2026-10-21T10:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IE'),
      headlineA: 'Dublin Airport passenger cap dispute moves to High Court for hearing',
      headlineB: 'Airlines launch legal challenge against 32 million passenger ceiling at Dublin Airport',
      entitiesA: ['dublin-airport'],
      entitiesB: ['dublin-airport'],
      pubDateA: '2026-10-21T11:15:00.000Z',
      pubDateB: '2026-10-21T11:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IE'),
      headlineA: 'Budget 2025 delivers cost of living payments and broad income tax cuts in Ireland',
      headlineB: 'Ministers Donohoe and Chambers unveil 10.5 billion euro budget package in Dublin',
      entitiesA: ['budget-ireland'],
      entitiesB: ['budget-ireland'],
      pubDateA: '2026-10-21T13:00:00.000Z',
      pubDateB: '2026-10-21T13:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IE'),
      headlineA: 'RTE announces new governance reforms following independent financial review',
      headlineB: 'National broadcaster RTE pledges transparency overhaul after inquiry findings',
      entitiesA: ['rte'],
      entitiesB: ['rte'],
      pubDateA: '2026-10-21T14:30:00.000Z',
      pubDateB: '2026-10-21T15:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IE'),
      headlineA: 'Garda probe launched following armed robbery at commercial bank in Cork',
      headlineB: 'Detectives appeal for witnesses after armed raid at Cork financial institution',
      entitiesA: ['garda', 'cork'],
      entitiesB: ['garda'],
      pubDateA: '2026-10-21T16:00:00.000Z',
      pubDateB: '2026-10-21T16:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IE'),
      headlineA: 'Apple pays 13 billion euros in back taxes into Irish escrow account',
      headlineB: 'Ireland prepares to receive billions in escrow funds after EU top court Apple ruling',
      entitiesA: ['apple', 'ireland'],
      entitiesB: ['apple', 'ireland'],
      pubDateA: '2026-10-21T10:30:00.000Z',
      pubDateB: '2026-10-21T11:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IE'),
      headlineA: 'EirGrid warns of growing electricity supply pressures during upcoming winter',
      headlineB: 'Grid operator EirGrid urges emergency reserve capacity as data centre demand rises',
      entitiesA: ['eirgrid'],
      entitiesB: ['eirgrid'],
      pubDateA: '2026-10-21T08:00:00.000Z',
      pubDateB: '2026-10-21T08:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IE'),
      headlineA: 'Ireland football team confirms new permanent manager ahead of Nations League matches',
      headlineB: 'FAI announces appointment of head coach for Republic of Ireland senior squad',
      entitiesA: ['fai', 'ireland-football'],
      entitiesB: ['fai'],
      pubDateA: '2026-10-21T17:15:00.000Z',
      pubDateB: '2026-10-21T17:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IE'),
      headlineA: 'Met Eireann issues status yellow wind and rain warnings for western counties',
      headlineB: 'Heavy rain and gale force winds set to batter Atlantic coastal counties',
      entitiesA: ['met-eireann'],
      entitiesB: ['met-eireann'],
      pubDateA: '2026-10-21T07:15:00.000Z',
      pubDateB: '2026-10-21T07:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IE'),
      headlineA: 'Dublin housing report reveals record rental prices across capital city',
      headlineB: 'Residential tenancy report shows Dublin average rents reaching all-time high',
      entitiesA: ['dublin-housing'],
      entitiesB: ['dublin-housing'],
      pubDateA: '2026-10-21T06:45:00.000Z',
      pubDateB: '2026-10-21T07:15:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IE'),
      headlineA: 'Irish pharma sector records 12 percent export surge in third quarter data',
      headlineB: 'Exports of pharmaceutical products drive expansion in Irish trade balance',
      entitiesA: ['irish-pharma'],
      entitiesB: ['irish-pharma'],
      pubDateA: '2026-10-21T09:00:00.000Z',
      pubDateB: '2026-10-21T09:20:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    }
  );

  // NZ (12)
  pairs.push(
    {
      id: nextId('SE-NZ'),
      headlineA: 'Reserve Bank of New Zealand cuts official cash rate to 4.75 percent',
      headlineB: 'RBNZ reduces OCR by 50 basis points to support economic recovery',
      entitiesA: ['rbnz', 'adrian-orr'],
      entitiesB: ['rbnz'],
      pubDateA: '2026-10-21T01:00:00.000Z',
      pubDateB: '2026-10-21T01:20:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-NZ'),
      headlineA: 'Christopher Luxon announces public service restructuring and spending cuts',
      headlineB: 'Prime Minister Christopher Luxon defends reduction in government department headcount',
      entitiesA: ['christopher-luxon'],
      entitiesB: ['christopher-luxon'],
      pubDateA: '2026-10-21T03:00:00.000Z',
      pubDateB: '2026-10-21T03:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-NZ'),
      headlineA: 'MetService issues severe weather warnings for Otago and Southland regions',
      headlineB: 'Torrential downpours cause surface flooding and slips across southern South Island',
      entitiesA: ['metservice', 'otago'],
      entitiesB: ['metservice'],
      pubDateA: '2026-10-21T04:30:00.000Z',
      pubDateB: '2026-10-21T05:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-NZ'),
      headlineA: 'New Zealand inflation drops back inside target band at 2.2 percent',
      headlineB: 'Stats NZ reports CPI inflation dropped to three-year low in September quarter',
      entitiesA: ['stats-nz', 'inflation'],
      entitiesB: ['stats-nz'],
      pubDateA: '2026-10-21T21:45:00.000Z',
      pubDateB: '2026-10-21T22:15:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-NZ'),
      headlineA: 'Auckland Council approves long-term water infrastructure resilience investment',
      headlineB: 'Councillors vote to fund comprehensive stormwater upgrades across Auckland region',
      entitiesA: ['auckland-council'],
      entitiesB: ['auckland-council'],
      pubDateA: '2026-10-21T02:15:00.000Z',
      pubDateB: '2026-10-21T02:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-NZ'),
      headlineA: 'Fonterra lifts farmgate milk price forecast following robust global dairy auction',
      headlineB: 'Dairy co-operative Fonterra increases payout range for Kiwi dairy farmers',
      entitiesA: ['fonterra'],
      entitiesB: ['fonterra'],
      pubDateA: '2026-10-21T20:30:00.000Z',
      pubDateB: '2026-10-21T21:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-NZ'),
      headlineA: 'Wellington Interislander ferry breakdown causes major Cook Strait freight delays',
      headlineB: 'Ferry sailing cancellations disrupt passenger and freight transit between islands',
      entitiesA: ['interislander', 'cook-strait'],
      entitiesB: ['interislander'],
      pubDateA: '2026-10-21T06:00:00.000Z',
      pubDateB: '2026-10-21T06:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-NZ'),
      headlineA: 'Waitangi Tribunal issues urgent report examining Treaty Principles Bill',
      headlineB: 'Tribunal findings urge government to reconsider proposed Treaty legislation',
      entitiesA: ['waitangi-tribunal'],
      entitiesB: ['waitangi-tribunal'],
      pubDateA: '2026-10-21T05:15:00.000Z',
      pubDateB: '2026-10-21T05:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-NZ'),
      headlineA: 'Air New Zealand adjusts full year earnings outlook citing engine maintenance delays',
      headlineB: 'Carrier Air New Zealand revises profit guidance as fleet availability constrained',
      entitiesA: ['air-new-zealand'],
      entitiesB: ['air-new-zealand'],
      pubDateA: '2026-10-21T22:30:00.000Z',
      pubDateB: '2026-10-21T23:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-NZ'),
      headlineA: 'All Blacks rugby squad named for upcoming northern hemisphere autumn tour',
      headlineB: 'Head coach Scott Robertson confirms 36-man All Blacks touring party',
      entitiesA: ['all-blacks', 'scott-robertson'],
      entitiesB: ['all-blacks'],
      pubDateA: '2026-10-21T07:30:00.000Z',
      pubDateB: '2026-10-21T08:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-NZ'),
      headlineA: 'Christchurch hospital opens state of the art emergency clinical wing',
      headlineB: 'New emergency medical facility opens to patients in central Christchurch',
      entitiesA: ['christchurch-hospital'],
      entitiesB: ['christchurch-hospital'],
      pubDateA: '2026-10-21T00:30:00.000Z',
      pubDateB: '2026-10-21T01:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-NZ'),
      headlineA: 'Department of Conservation confirms successful breeding season for rare kakapo',
      headlineB: 'Endangered native kakapo population receives boost with record chick survival',
      entitiesA: ['doc', 'kakapo'],
      entitiesB: ['doc'],
      pubDateA: '2026-10-21T03:45:00.000Z',
      pubDateB: '2026-10-21T04:15:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    }
  );

  // IN English (10)
  pairs.push(
    {
      id: nextId('SE-IN'),
      headlineA: 'Reserve Bank of India keeps policy repo rate unchanged at 6.5 percent',
      headlineB: 'RBI monetary policy committee votes to hold benchmark repo rate steady at 6.5%',
      entitiesA: ['rbi', 'shaktikanta-das'],
      entitiesB: ['rbi'],
      pubDateA: '2026-10-21T04:30:00.000Z',
      pubDateB: '2026-10-21T04:50:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IN'),
      headlineA: 'ISRO successfully conducts critical propulsion test for Gaganyaan space mission',
      headlineB: 'Space agency ISRO completes major milestone test for Gaganyaan astronaut capsule',
      entitiesA: ['isro', 'gaganyaan'],
      entitiesB: ['isro', 'gaganyaan'],
      pubDateA: '2026-10-21T08:00:00.000Z',
      pubDateB: '2026-10-21T08:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IN'),
      headlineA: 'Air quality in Delhi enters severe category as AQI crosses 400 mark',
      headlineB: 'Toxic smog envelopes national capital Delhi as winter pollution levels spike',
      entitiesA: ['delhi-pollution'],
      entitiesB: ['delhi-pollution'],
      pubDateA: '2026-10-21T03:00:00.000Z',
      pubDateB: '2026-10-21T03:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IN'),
      headlineA: 'Southwest monsoon arrives in Kerala two days ahead of normal schedule',
      headlineB: 'Weather department IMD announces official onset of monsoon over Kerala coast',
      entitiesA: ['imd', 'kerala-monsoon'],
      entitiesB: ['imd'],
      pubDateA: '2026-10-21T06:15:00.000Z',
      pubDateB: '2026-10-21T06:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IN'),
      headlineA: 'Supreme Court of India strikes down electoral bonds scheme as unconstitutional',
      headlineB: 'Apex court declares controversial political electoral bonds invalid in verdict',
      entitiesA: ['supreme-court-india'],
      entitiesB: ['supreme-court-india'],
      pubDateA: '2026-10-21T05:30:00.000Z',
      pubDateB: '2026-10-21T06:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IN'),
      headlineA: 'Dense fog disrupts flight operations and rail traffic across northern India',
      headlineB: 'Low visibility from winter fog delays dozens of passenger trains in Delhi and Punjab',
      entitiesA: ['northern-railways'],
      entitiesB: ['northern-railways'],
      pubDateA: '2026-10-21T02:00:00.000Z',
      pubDateB: '2026-10-21T02:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IN'),
      headlineA: 'Tata Sons and Singapore Airlines complete merger of Air India and Vistara',
      headlineB: 'Full service carrier Vistara operates final flight before historic Air India integration',
      entitiesA: ['air-india', 'vistara'],
      entitiesB: ['air-india', 'vistara'],
      pubDateA: '2026-10-21T18:00:00.000Z',
      pubDateB: '2026-10-21T18:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IN'),
      headlineA: 'India and China reach agreement on military patrolling along LAC border',
      headlineB: 'Foreign ministry confirms pact with China on patrolling arrangements in Ladakh',
      entitiesA: ['lac-border', 'ladakh'],
      entitiesB: ['lac-border'],
      pubDateA: '2026-10-21T11:00:00.000Z',
      pubDateB: '2026-10-21T11:30:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IN'),
      headlineA: 'Nifty and Sensex close at record highs driven by banking and IT shares',
      headlineB: 'Indian stock market benchmark Sensex rallies 600 points to touch fresh peak',
      entitiesA: ['bse-sensex', 'nifty'],
      entitiesB: ['bse-sensex'],
      pubDateA: '2026-10-21T10:15:00.000Z',
      pubDateB: '2026-10-21T10:45:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-IN'),
      headlineA: 'Election Commission announces poll schedule for Maharashtra and Jharkhand assembly',
      headlineB: 'EC declares dates for upcoming state legislative assembly elections',
      entitiesA: ['election-commission-india'],
      entitiesB: ['election-commission-india'],
      pubDateA: '2026-10-21T09:30:00.000Z',
      pubDateB: '2026-10-21T10:00:00.000Z',
      language: 'en',
      category: 'same_event',
      expectedMerge: true,
    }
  );

  // IN Hindi (10)
  pairs.push(
    {
      id: nextId('SE-HI'),
      headlineA: 'भारतीय रिज़र्व बैंक ने रेपो रेट में नहीं किया कोई बदलाव, 6.5 प्रतिशत पर बरकरार',
      headlineB: 'आरबीआई मौद्रिक नीति समिति ने नीतिगत रेपो दर 6.5 फीसदी पर स्थिर रखने का फैसला किया',
      entitiesA: ['rbi', 'shaktikanta-das'],
      entitiesB: ['rbi'],
      pubDateA: '2026-10-21T04:30:00.000Z',
      pubDateB: '2026-10-21T04:55:00.000Z',
      language: 'hi',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-HI'),
      headlineA: 'इसरो ने गगनयान मानव अंतरिक्ष मिशन के लिए महत्वपूर्ण रॉकेट परीक्षण सफलतापूर्वक पूरा किया',
      headlineB: 'अंतरिक्ष अनुसंधान संगठन इसरो ने गगनयान अभियान के प्रणोदन चरण का सफल परीक्षण किया',
      entitiesA: ['isro', 'gaganyaan'],
      entitiesB: ['isro', 'gaganyaan'],
      pubDateA: '2026-10-21T08:00:00.000Z',
      pubDateB: '2026-10-21T08:35:00.000Z',
      language: 'hi',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-HI'),
      headlineA: 'दिल्ली में वायु गुणवत्ता बेहद गंभीर श्रेणी में पहुंची, एक्यूआई 400 के पार दर्ज',
      headlineB: 'राजधानी दिल्ली में प्रदूषण ने बढ़ाई परेशानी, कई इलाकों में धुंध की घनी चादर',
      entitiesA: ['delhi-pollution'],
      entitiesB: ['delhi-pollution'],
      pubDateA: '2026-10-21T03:00:00.000Z',
      pubDateB: '2026-10-21T03:30:00.000Z',
      language: 'hi',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-HI'),
      headlineA: 'दक्षिण-पश्चिम मॉनसून ने केरल तट पर समय से पहले दी दस्तक, मौसम विभाग की पुष्टि',
      headlineB: 'मौसम विभाग आईएमडी ने केरल में मानसूनी बारिश शुरू होने की औपचारिक घोषणा की',
      entitiesA: ['imd', 'kerala-monsoon'],
      entitiesB: ['imd'],
      pubDateA: '2026-10-21T06:15:00.000Z',
      pubDateB: '2026-10-21T06:45:00.000Z',
      language: 'hi',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-HI'),
      headlineA: 'सुप्रीम कोर्ट ने चुनावी बॉन्ड योजना को असंवैधानिक घोषित कर तत्काल प्रभाव से रद्द किया',
      headlineB: 'शीर्ष अदालत ने राजनीतिक दलों के चुनावी चंदे से जुड़ी इलेक्टोरल बॉन्ड योजना खारिज की',
      entitiesA: ['supreme-court-india'],
      entitiesB: ['supreme-court-india'],
      pubDateA: '2026-10-21T05:30:00.000Z',
      pubDateB: '2026-10-21T06:00:00.000Z',
      language: 'hi',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-HI'),
      headlineA: 'उत्तर भारत में घने कोहरे के कारण दर्जनों ट्रेनें और हवाई उड़ानें प्रभावित',
      headlineB: 'शीतकालीन कोहरे से रेल यातायात बाधित, दिल्ली आने वाली कई रेलगाड़ियां घंटों देरी से',
      entitiesA: ['northern-railways'],
      entitiesB: ['northern-railways'],
      pubDateA: '2026-10-21T02:00:00.000Z',
      pubDateB: '2026-10-21T02:30:00.000Z',
      language: 'hi',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-HI'),
      headlineA: 'विस्तारा एयरलाइंस का एयर इंडिया में औपचारिक विलय संपन्न हुआ',
      headlineB: 'टाटा समूह की दो एयरलाइनों विस्तारा और एयर इंडिया का ऐतिहासिक एकीकरण पूरा',
      entitiesA: ['air-india', 'vistara'],
      entitiesB: ['air-india', 'vistara'],
      pubDateA: '2026-10-21T18:00:00.000Z',
      pubDateB: '2026-10-21T18:30:00.000Z',
      language: 'hi',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-HI'),
      headlineA: 'भारत और चीन के बीच वास्तविक नियंत्रण रेखा पर गश्त को लेकर बड़ा समझौता',
      headlineB: 'पूर्वी लद्दाख में सीमा विवाद सुलझाने की दिशा में भारत-चीन के बीच अहम सहमति',
      entitiesA: ['lac-border', 'ladakh'],
      entitiesB: ['lac-border'],
      pubDateA: '2026-10-21T11:00:00.000Z',
      pubDateB: '2026-10-21T11:30:00.000Z',
      language: 'hi',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-HI'),
      headlineA: 'शेयर बाजार में जबरदस्त तेजी, सेंसेक्स और निफ्टी नए सर्वकालिक उच्च स्तर पर बंद',
      headlineB: 'बैंकिंग और आईटी शेयरों की लिवाली से शेयर बाजार में रिकॉर्ड बढ़त दर्ज की गई',
      entitiesA: ['bse-sensex', 'nifty'],
      entitiesB: ['bse-sensex'],
      pubDateA: '2026-10-21T10:15:00.000Z',
      pubDateB: '2026-10-21T10:45:00.000Z',
      language: 'hi',
      category: 'same_event',
      expectedMerge: true,
    },
    {
      id: nextId('SE-HI'),
      headlineA: 'चुनाव आयोग ने महाराष्ट्र और झारखंड विधानसभा चुनाव की तारीखों का ऐलान किया',
      headlineB: 'मुख्य चुनाव आयुक्त ने दो प्रमुख राज्यों के विधानसभा चुनाव कार्यक्रम की घोषणा की',
      entitiesA: ['election-commission-india'],
      entitiesB: ['election-commission-india'],
      pubDateA: '2026-10-21T09:30:00.000Z',
      pubDateB: '2026-10-21T10:00:00.000Z',
      language: 'hi',
      category: 'same_event',
      expectedMerge: true,
    }
  );

  // 2. different_event: 70 pairs (expectedMerge: false)
  // Headlines with superficial word overlap but distinct events
  const diffEventTemplates = [
    {
      hA: 'Bank of England raises inflation forecast for the coming financial year',
      hB: 'Federal Reserve warns of persistent inflation in service sector economy',
      eA: ['bank-of-england'], eB: ['federal-reserve'],
    },
    {
      hA: 'Keir Starmer speaks at trade union congress conference in Brighton',
      hB: 'Anthony Albanese delivers economic keynote address to Sydney business chamber',
      eA: ['keir-starmer'], eB: ['anthony-albanese'],
    },
    {
      hA: 'Police investigate armed robbery at Manchester luxury jewellery shop',
      hB: 'Detectives launch murder investigation after fatal stabbing incident in Leeds',
      eA: ['greater-manchester-police'], eB: ['west-yorkshire-police'],
    },
    {
      hA: 'Apple announces upcoming launch of iPhone 16 product family in California',
      hB: 'Google reveals next generation Gemini artificial intelligence features in Android',
      eA: ['apple'], eB: ['google'],
    },
    {
      hA: 'Wildfire threatens mountain communities in central Washington state',
      hB: 'Bushfire burns out of control near Adelaide Hills in South Australia',
      eA: ['washington-state'], eB: ['south-australia'],
    },
    {
      hA: 'High Court upholds government policy regarding offshore immigration detention',
      hB: 'Supreme Court hears arguments concerning environmental water allocation rights',
      eA: ['high-court-uk'], eB: ['supreme-court-us'],
    },
    {
      hA: 'Mayor of London introduces extended ultra-low emission vehicle charges',
      hB: 'Mayor of Toronto proposes property tax increase to fund transit expansion',
      eA: ['london'], eB: ['toronto'],
    },
    {
      hA: 'Health service workers vote in favour of nationwide ambulance strike action',
      hB: 'Postal delivery employees begin 48-hour walkout over disputed pension terms',
      eA: ['nhs'], eB: ['royal-mail'],
    },
    {
      hA: 'Treasury reports unexpected surplus in monthly corporation tax receipts',
      hB: 'Internal Revenue Service releases updated guidance on foreign asset reporting',
      eA: ['hm-treasury'], eB: ['irs'],
    },
    {
      hA: 'British Airways cancels short-haul European flights due to technical failure',
      hB: 'Qantas grounds domestic aircraft following routine safety sensor alert',
      eA: ['british-airways'], eB: ['qantas'],
    },
    {
      hA: 'Manchester United secure dramatic victory in Champions League group fixture',
      hB: 'Arsenal advance to Carabao Cup quarter-final with comfortable away win',
      eA: ['manchester-united'], eB: ['arsenal'],
    },
    {
      hA: 'Defence ministry approves contract for new naval submarine construction',
      hB: 'Air Force conducts supersonic flight training exercise over desert testing range',
      eA: ['royal-navy'], eB: ['usaf'],
    },
    {
      hA: 'Central Bank of Canada monitors commercial real estate loan delinquency rates',
      hB: 'Reserve Bank of New Zealand reviews banking capital adequacy requirements',
      eA: ['bank-of-canada'], eB: ['rbnz'],
    },
    {
      hA: 'Severe thunderstorm brings torrential rain and flash flooding to Brisbane',
      hB: 'Winter blizzard dumps heavy snow across rural highways in Manitoba',
      eA: ['brisbane'], eB: ['manitoba'],
    },
    {
      hA: 'Automaker Ford announces restructuring of electric vehicle battery operations',
      hB: 'General Motors expands autonomous vehicle test fleet in Arizona cities',
      eA: ['ford'], eB: ['gm'],
    },
    {
      hA: 'Oil prices rise following unexpected production cut by OPEC cartel members',
      hB: 'Natural gas futures slide on European exchange as storage levels reach capacity',
      eA: ['opec'], eB: ['european-energy'],
    },
    {
      hA: 'Archaeologists uncover Roman mosaic floor during highway construction in Dorset',
      hB: 'Researchers discover ancient Mayan ceremonial temple hidden in Guatemalan jungle',
      eA: ['archaeology-uk'], eB: ['archaeology-guatemala'],
    },
    {
      hA: 'Pharmaceutical firm AstraZeneca reports positive trial results for lung cancer drug',
      hB: 'Moderna initiates phase three clinical testing of universal influenza vaccine',
      eA: ['astrazeneca'], eB: ['moderna'],
    },
    {
      hA: 'Space agency ESA selects new astronaut candidate class for orbital training',
      hB: 'Private space firm Rocket Lab successfully launches commercial communications payload',
      eA: ['esa'], eB: ['rocket-lab'],
    },
    {
      hA: 'University of Oxford researchers develop rapid diagnostic blood test for sepsis',
      hB: 'MIT engineers fabricate high-efficiency solar panel from perovskite crystals',
      eA: ['oxford-university'], eB: ['mit'],
    },
    {
      hA: 'Dublin City Council approves funding for river bridge refurbishment work',
      hB: 'Cork County Council implements temporary flood defences along river quay',
      eA: ['dublin-council'], eB: ['cork-council'],
    },
    {
      hA: 'Electoral reform commission in New Zealand suggests lowering voting threshold',
      hB: 'Canadian senate committee conducts study into parliamentary voting systems',
      eA: ['nz-electoral'], eB: ['canada-senate'],
    },
    {
      hA: 'Supermarket chain Tesco reports quarterly grocery revenue growth of five percent',
      hB: 'Australian retail giant Woolworths faces regulatory inquiry over supplier contracts',
      eA: ['tesco'], eB: ['woolworths'],
    },
    {
      hA: 'Scottish government introduces legislation protecting ancient peatland ecosystems',
      hB: 'Welsh government announces financial subsidies for hillside sheep farmers',
      eA: ['scotland-govt'], eB: ['wales-govt'],
    },
    {
      hA: 'Civil aviation authority grounds light aircraft fleet following engine defect',
      hB: 'Maritime safety bureau releases report into fishing vessel collision off coast',
      eA: ['caa-uk'], eB: ['atsb-au'],
    },
    {
      hA: 'National Gallery opens comprehensive retrospective of Impressionist landscape paintings',
      hB: 'Tate Modern unveils monumental contemporary sculpture in turbine hall',
      eA: ['national-gallery'], eB: ['tate-modern'],
    },
    {
      hA: 'Nuclear regulatory commission inspects power station cooling tower facilities',
      hB: 'Offshore wind farm achieves record electricity generation during North Sea gale',
      eA: ['nrc-us'], eB: ['orsted'],
    },
    {
      hA: 'Belfast port reports container cargo throughput expansion in annual figures',
      hB: 'Auckland freight terminal upgrades electric container crane infrastructure',
      eA: ['belfast-port'], eB: ['auckland-port'],
    },
    {
      hA: 'Telecom provider Vodafone announces nationwide broadband network upgrade programme',
      hB: 'Telstra conducts commercial trials of satellite-to-mobile text messaging technology',
      eA: ['vodafone'], eB: ['telstra'],
    },
    {
      hA: 'Minister for Education proposes revised mathematics curriculum for primary schools',
      hB: 'Higher education authority reviews tuition fee support for university students',
      eA: ['education-uk'], eB: ['education-ireland'],
    },
    {
      hA: 'Gold mining corporation acquires exploration rights for deposit in Western Australia',
      hB: 'Copper mining venture discovers high-grade mineral vein in Chilean Andes',
      eA: ['mining-wa'], eB: ['mining-chile'],
    },
    {
      hA: 'Hospital emergency department experiences record patient waiting times in Wales',
      hB: 'Regional clinic expands pediatric outpatient consultation hours in Queensland',
      eA: ['nhs-wales'], eB: ['queensland-health'],
    },
    {
      hA: 'Border security agency intercepts illicit wildlife smuggling shipment at airport',
      hB: 'Customs officials seize counterfeit luxury watches arriving at seaport warehouse',
      eA: ['uk-border-force'], eB: ['us-cbp'],
    },
    {
      hA: 'Historic theatre in Manchester reopens following multi-million pound structural renovation',
      hB: 'Opera house in Sydney marks fiftieth anniversary with gala classical concert',
      eA: ['manchester-theatre'], eB: ['sydney-opera-house'],
    },
    {
      hA: 'Agricultural researchers warning of fungal blight affecting commercial wheat crops',
      hB: 'Horticultural institute releases drought-resistant olive tree cultivar',
      eA: ['agriculture-uk'], eB: ['agriculture-au'],
    },
    // 35 English pairs done; now 35 more diverse pairs
    {
      hA: 'Tech startup raises thirty million in venture funding for cybersecurity platform',
      hB: 'Robotics manufacturer secures commercial contract for automated warehouse systems',
      eA: ['cyber-startup'], eB: ['robotics-corp'],
    },
    {
      hA: 'Insurance firms raise household premium rates in flood-prone river catchment areas',
      hB: 'Mortgage lenders tighten loan-to-value borrowing criteria for first-time buyers',
      eA: ['insurance-uk'], eB: ['lending-uk'],
    },
    {
      hA: 'Freight rail operator introduces hydrogen-powered locomotive on freight corridor',
      hB: 'Public transit agency purchases fleet of battery-electric double-decker buses',
      eA: ['freight-rail'], eB: ['city-transit'],
    },
    {
      hA: 'Competition regulator approves grocery supply chain merger with conditions',
      hB: 'Financial conduct authority issues warning regarding unregistered investment schemes',
      eA: ['cma-uk'], eB: ['fca-uk'],
    },
    {
      hA: 'Meteorology office forecasts unseasonably warm weather across southern England',
      hB: 'Weather service warns of early autumn frost across highland farming districts',
      eA: ['met-office-uk'], eB: ['met-office-scotland'],
    },
    {
      hA: 'Publishing house awards prestigious international literary fiction prize in Dublin',
      hB: 'Film festival committee announces opening night documentary screening selection',
      eA: ['literary-prize'], eB: ['film-festival'],
    },
    {
      hA: 'City planners approve construction of twenty-storey commercial office tower',
      hB: 'Heritage commission opposes redevelopment of Victorian industrial brick warehouse',
      eA: ['birmingham-planning'], eB: ['heritage-birmingham'],
    },
    {
      hA: 'Consumer rights group files class action lawsuit over defective vehicle engines',
      hB: 'Electronics retailer agrees settlement regarding misleading warranty advertising',
      eA: ['consumer-rights'], eB: ['retailer-lawsuit'],
    },
    {
      hA: 'Solar energy installation achieves peak power generation across commercial rooftops',
      hB: 'Geothermal energy facility begins test drilling in volcanic regional basin',
      eA: ['solar-energy'], eB: ['geothermal-energy'],
    },
    {
      hA: 'Forestry service implements controlled burn operation to prevent summer wildfire',
      hB: 'Wildlife sanctuary releases rehabilitated raptors back into native mountain habitat',
      eA: ['forestry-service'], eB: ['wildlife-sanctuary'],
    },
    {
      hA: 'Police arrest four suspects in coordinated crackdown on vehicle theft syndicate',
      hB: 'Anti-fraud squad dismantles online phishing network targeting banking customers',
      eA: ['police-crackdown'], eB: ['fraud-squad'],
    },
    {
      hA: 'Brewer Guinness announces expansion of non-alcoholic stout brewing capacity',
      hB: 'Distillery releases limited single malt Scotch whisky aged in sherry oak casks',
      eA: ['guinness'], eB: ['scotch-distillery'],
    },
    {
      hA: 'National equestrian championship concludes with exciting show jumping contest',
      hB: 'Rowing regatta attracts hundreds of university crews to historic river course',
      eA: ['equestrian-championship'], eB: ['rowing-regatta'],
    },
    {
      hA: 'Public library service marks centenary with community reading marathon festival',
      hB: 'Science museum launches interactive astronomy exhibit featuring meteorite collection',
      eA: ['library-service'], eB: ['science-museum'],
    },
    {
      hA: 'Commercial airline adds direct route connecting Glasgow and Toronto airports',
      hB: 'Cruise liner visits regional port on maiden voyage around British coastline',
      eA: ['glasgow-airport'], eB: ['cruise-liner'],
    },
    {
      hA: 'Biotech researchers identify cellular mechanism responsible for tissue aging',
      hB: 'Immunology team develops monoclonal antibody therapy for autoimmune disorder',
      eA: ['biotech-aging'], eB: ['immunology-team'],
    },
    {
      hA: 'Local council installs electric vehicle charging stations across municipal car parks',
      hB: 'Highway authority commences resurfacing work on interstate motorway interchange',
      eA: ['council-ev'], eB: ['highway-authority'],
    },
    {
      hA: 'Water utility company invests in advanced filtration technology to remove PFAS',
      hB: 'Desalination plant provides drought backup for coastal agricultural region',
      eA: ['water-utility'], eB: ['desalination-plant'],
    },
    {
      hA: 'National youth orchestra performs Beethoven symphony to standing ovation',
      hB: 'Jazz festival draws international trumpeters and saxophonists to city clubs',
      eA: ['youth-orchestra'], eB: ['jazz-festival'],
    },
    {
      hA: 'Botanical garden conservators successfully pollinate rare titan arum corpse flower',
      hB: 'Seed bank stores millions of crop seed varieties in arctic permafrost vault',
      eA: ['botanical-garden'], eB: ['seed-vault'],
    },
    {
      hA: 'Urban farm initiative produces fresh vegetables for local food pantry network',
      hB: 'Vertical farming enterprise expands indoor leafy green facility near airport',
      eA: ['urban-farm'], eB: ['vertical-farming'],
    },
    {
      hA: 'Consumer watchdog warns shoppers of deceptive price discounts during holiday sale',
      hB: 'Credit card provider updates rewards programme terms and foreign transaction fees',
      eA: ['consumer-watchdog'], eB: ['credit-card-rewards'],
    },
    {
      hA: 'Maritime archaeological expedition surveys shipwreck resting in deep Atlantic trench',
      hB: 'Oceanographers deploy autonomous submersibles to map underwater tectonic fault lines',
      eA: ['shipwreck-expedition'], eB: ['oceanography-team'],
    },
    {
      hA: 'City government introduces separated cycle lane network along commuter arterial road',
      hB: 'Suburban train station opens multi-storey commuter car park with bike storage',
      eA: ['cycle-lanes'], eB: ['train-station-parking'],
    },
    {
      hA: 'Waste management authority achieves seventy percent household recycling target',
      hB: 'Packaging manufacturer replaces single-use plastics with compostable seaweed material',
      eA: ['waste-authority'], eB: ['seaweed-packaging'],
    },
    // Hindi different_event pairs (10)
    {
      hA: 'उत्तर प्रदेश में नए एक्सप्रेसवे के निर्माण को कैबिनेट की मंजूरी मिली',
      hB: 'बिहार में गंगा नदी पर नए पुल का निर्माण कार्य तेजी से जारी',
      eA: ['up-cabinet'], eB: ['bihar-govt'],
    },
    {
      hA: 'मध्य प्रदेश में बाघों की संख्या में उत्साहजनक वृद्धि दर्ज की गई',
      hB: 'असम के काजीरंगा राष्ट्रीय उद्यान में गैंडों के संरक्षण के लिए विशेष दल तैनात',
      eA: ['mp-wildlife'], eB: ['kaziranga'],
    },
    {
      hA: 'उत्तराखंड में चारधाम यात्रा के दौरान तीर्थयात्रियों की संख्या ने नया रिकॉर्ड बनाया',
      hB: 'हिमाचल प्रदेश में सेब की नई फसल मंडियों में पहुंचने से किसानों के चेहरे खिले',
      eA: ['chardham-yatra'], eB: ['himachal-apples'],
    },
    {
      hA: 'राजस्थान में सौर ऊर्जा परियोजनाओं के विस्तार के लिए नई नीति जारी की गई',
      hB: 'गुजरात में पवन ऊर्जा संयंत्रों से बिजली उत्पादन में ऐतिहासिक बढ़ोतरी दर्ज',
      eA: ['rajasthan-solar'], eB: ['gujarat-wind'],
    },
    {
      hA: 'पंजाब में पराली प्रबंधन को लेकर किसानों को आधुनिक कृषि उपकरण वितरित किए गए',
      hB: 'हरियाणा में न्यूनतम समर्थन मूल्य पर बाजरे की खरीद प्रक्रिया शुरू हुई',
      eA: ['punjab-farming'], eB: ['haryana-procurement'],
    },
    {
      hA: 'वाराणसी में गंगा आरती देखने पहुंचे विदेशी पर्यटकों में जबरदस्त उत्साह',
      hB: 'अयोध्या में राम मंदिर परिसर के आसपास सौंदर्यीकरण का काम अंतिम चरण में',
      eA: ['varanasi-ganga'], eB: ['ayodhya-mandir'],
    },
    {
      hA: 'दिल्ली मेट्रो ने प्रमुख कॉरिडोर पर स्वचालित सिग्नलिंग प्रणाली का परीक्षण शुरू किया',
      hB: 'मुंबई लोकल ट्रेनों में यात्रियों की सुरक्षा के लिए सीसीटीवी निगरानी बढ़ाई गई',
      eA: ['delhi-metro'], eB: ['mumbai-local'],
    },
    {
      hA: 'भारतीय अंतरिक्ष एजेंसी ने नए मौसम उपग्रह के प्रक्षेपण की तैयारियां तेज कीं',
      hB: 'रक्षा अनुसंधान संगठन ने स्वदेशी मिसाइल प्रणाली का सफल उड़ान परीक्षण किया',
      eA: ['isro-satellite'], eB: ['drdo-missile'],
    },
    {
      hA: 'आयुष मंत्रालय ने पारंपरिक चिकित्सा पद्धतियों को बढ़ावा देने के लिए नए केंद्र खोले',
      hB: 'केंद्रीय स्वास्थ्य मंत्रालय ने ग्रामीण क्षेत्रों में टेलीमेडिसिन सेवाओं का विस्तार किया',
      eA: ['ayush-ministry'], eB: ['health-ministry'],
    },
    {
      hA: 'भारतीय मुक्केबाजों ने एशियाई चैंपियनशिप में दो स्वर्ण और तीन रजत पदक जीते',
      hB: 'राष्ट्रीय कुश्ती प्रतियोगिता में युवा पहलवानों ने उत्कृष्ट प्रदर्शन कर खिताब जीता',
      eA: ['asian-boxing'], eB: ['national-wrestling'],
    }
  ];

  diffEventTemplates.forEach((t) => {
    pairs.push({
      id: nextId('DE'),
      headlineA: t.hA,
      headlineB: t.hB,
      entitiesA: t.eA,
      entitiesB: t.eB,
      pubDateA: '2026-10-21T08:00:00.000Z',
      pubDateB: '2026-10-21T10:00:00.000Z',
      language: /[\u0900-\u097F]/.test(t.hA) ? 'hi' : 'en',
      category: 'different_event',
      expectedMerge: false,
    });
  });

  // 3. round_conflict: 20 pairs (expectedMerge: false)
  const roundConflictPairs = [
    {
      hA: 'Australia and India battle on Day 1 of Adelaide Test cricket match',
      hB: 'India fight back strongly against Australia on Day 2 of Adelaide Test',
      e: ['adelaide-test'],
    },
    {
      hA: 'England dominate Day 3 of Lord\'s Test with aggressive batting performance',
      hB: 'South Africa pace bowlers strike back on Day 4 of Lord\'s Test encounter',
      e: ['lords-test'],
    },
    {
      hA: 'Champions League semi-final first leg ends in tense goalless stalemate in Madrid',
      hB: 'Dramatic turnaround in Champions League semi-final second leg stuns fans',
      e: ['champions-league'],
    },
    {
      hA: 'World Cup tournament: England secure commanding victory in round of 16',
      hB: 'World Cup tournament: England suffer agonizing defeat in quarter-final clash',
      e: ['world-cup'],
    },
    {
      hA: 'Wimbledon Championships: Carlos Alcaraz cruises through round 1 in straight sets',
      hB: 'Wimbledon Championships: Carlos Alcaraz survives grueling five-set round 2 match',
      e: ['wimbledon', 'alcaraz'],
    },
    {
      hA: 'Formula One championship: Drivers complete initial practice in opening stage',
      hB: 'Formula One championship: Pole position decided in dramatic final stage qualifying',
      e: ['formula-one'],
    },
    {
      hA: 'NBA playoffs: Boston Celtics take series opener with dominant victory in game 1',
      hB: 'NBA playoffs: Mavericks bounce back with overtime triumph in intense game 2',
      e: ['nba-playoffs'],
    },
    {
      hA: 'Documentary investigation part one examines rapid rise of tech corporate empire',
      hB: 'Documentary investigation part two reveals disastrous financial collapse of firm',
      e: ['tech-documentary'],
    },
    {
      hA: 'Golf major championship: Scheffler shoots course record during opening day 1',
      hB: 'Golf major championship: McIlroy surges into weekend lead throughout day 2',
      e: ['golf-major'],
    },
    {
      hA: 'Six Nations rugby: Ireland overcome physical battle in tournament round 1',
      hB: 'Six Nations rugby: France claim bonus point win in pulsating round 2 contest',
      e: ['six-nations'],
    },
    {
      hA: 'AFL finals series: Sydney Swans celebrate preliminary final victory over rivals',
      hB: 'AFL finals series: Brisbane Lions capture premiership cup in grand final thriller',
      e: ['afl-finals'],
    },
    {
      hA: 'World Snooker Championship: Mark Selby advances from preliminary round 1 test',
      hB: 'World Snooker Championship: Selby knocked out following dramatic quarter-final',
      e: ['world-snooker'],
    },
    {
      hA: 'Rugby League State of Origin: Queensland triumph in thrilling opener game one',
      hB: 'Rugby League State of Origin: New South Wales square series with victory in game two',
      e: ['state-of-origin'],
    },
    {
      hA: 'Cycling Tour de France: Sprinters duel for victory in flat opening stage 1',
      hB: 'Cycling Tour de France: Climbers attack grueling mountain passes in stage 2',
      e: ['tour-de-france'],
    },
    {
      hA: 'Cricket World Cup: Australia emerge victorious in tournament semi-final showdown',
      hB: 'Cricket World Cup: India lift champion trophy after dominant performance in final',
      e: ['cricket-world-cup'],
    },
    {
      hA: 'US Open tennis: Coco Gauff battles through challenging first round encounter',
      hB: 'US Open tennis: Gauff bows out after fierce contest in fourth round thriller',
      e: ['us-open', 'coco-gauff'],
    },
    {
      hA: 'Elections debate: Political leaders clash fiercely in national debate round 1',
      hB: 'Elections debate: Key policies scrutinized in final televised debate round 2',
      e: ['leaders-debate'],
    },
    // Hindi round conflicts (3)
    {
      hA: 'भारत और ऑस्ट्रेलिया के बीच बॉर्डर-गावस्कर ट्रॉफी टेस्ट मैच के दिन 1 का खेल खत्म',
      hB: 'बॉर्डर-गावस्कर ट्रॉफी टेस्ट मैच के दिन 2 में भारतीय गेंदबाजों का शानदार प्रदर्शन',
      e: ['border-gavaskar'],
    },
    {
      hA: 'लोकसभा चुनाव के पहले चरण में 60 फीसदी से अधिक मतदान दर्ज किया गया',
      hB: 'लोकसभा चुनाव के दूसरे चरण में कई दिग्गजों की साख दांव पर लगी',
      e: ['lok-sabha-polls'],
    },
    {
      hA: 'विश्व कप हॉकी प्रतियोगिता: भारत ने लीग चरण में जीत हासिल की',
      hB: 'विश्व कप हॉकी प्रतियोगिता: क्वार्टर फाइनल मुकाबले में भारतीय टीम की हार',
      e: ['hockey-world-cup'],
    }
  ];

  roundConflictPairs.forEach((rc) => {
    pairs.push({
      id: nextId('RC'),
      headlineA: rc.hA,
      headlineB: rc.hB,
      entitiesA: rc.e,
      entitiesB: rc.e,
      pubDateA: '2026-10-21T06:00:00.000Z',
      pubDateB: '2026-10-21T14:00:00.000Z',
      language: /[\u0900-\u097F]/.test(rc.hA) ? 'hi' : 'en',
      category: 'round_conflict',
      expectedMerge: false,
    });
  });

  // 4. temporal_conflict: 15 pairs (expectedMerge: false)
  const temporalConflictPairs = [
    {
      hA: 'London commuters face travel chaos during Friday morning rush hour',
      hB: 'London commuters welcome restored rail service by Friday evening commute',
      e: ['london-rail'],
    },
    {
      hA: 'Prime minister addresses reporters during Monday morning press conference',
      hB: 'Cabinet members gather in Downing Street for emergency Monday night discussions',
      e: ['downing-street'],
    },
    {
      hA: 'Severe coastal gale batters seaside promenades on Friday afternoon',
      hB: 'Clean-up operations commence across coastal promenades on Saturday morning',
      e: ['coastal-storm'],
    },
    {
      hA: 'Stock market index plunges sharply during volatile Friday morning trading',
      hB: 'Equities stage strong late recovery before Friday evening closing bell',
      e: ['stock-index'],
    },
    {
      hA: 'Police cordon off city centre following Friday night collision incident',
      hB: 'Authorities reopen downtown streets following Saturday morning inspection',
      e: ['city-police'],
    },
    {
      hA: 'Paramedics treat injured passengers following Monday morning train derailment',
      hB: 'Railway safety inspectors examine derailed locomotive on Tuesday morning',
      e: ['rail-incident'],
    },
    {
      hA: 'Emergency firefighters respond to commercial warehouse blaze on Thursday night',
      hB: 'Fire investigation officers search smouldering warehouse rubble on Friday morning',
      e: ['fire-department'],
    },
    {
      hA: 'Protesters gather in parliamentary square during Tuesday afternoon rally',
      hB: 'Parliament square cleared by security officers before Wednesday morning debate',
      e: ['parliament-square'],
    },
    {
      hA: 'Flooding engulfs suburban road underpasses during Thursday morning downpour',
      hB: 'Drainage crews pump floodwaters from highway underpasses on Thursday night',
      e: ['suburban-flooding'],
    },
    {
      hA: 'Search teams deploy rescue boats in coastal bay on Sunday morning',
      hB: 'Coastguard suspends maritime search operations late on Sunday night',
      e: ['coastal-search'],
    },
    {
      hA: 'Hospital declares critical incident due to severe Monday afternoon crowding',
      hB: 'Emergency medical department resumes normal operations by Tuesday morning',
      e: ['regional-hospital'],
    },
    {
      hA: 'Flight operations suspended at regional airport amid dense Tuesday morning fog',
      hB: 'Runway reopened as visibility conditions improve by Tuesday afternoon',
      e: ['regional-airport'],
    },
    // Hindi temporal conflicts (3)
    {
      hA: 'राजधानी में शुक्रवार सुबह घने कोहरे के कारण दृश्यता शून्य दर्ज की गई',
      hB: 'शुक्रवार शाम तेज धूप निकलने से लोगों को कोहरे से राहत मिली',
      e: ['delhi-weather'],
    },
    {
      hA: 'मुख्यमंत्री ने शनिवार सुबह बाढ़ प्रभावित क्षेत्रों का हवाई सर्वेक्षण किया',
      hB: 'बाढ़ राहत कार्यों को लेकर शनिवार रात आपातकालीन बैठक बुलाई गई',
      e: ['flood-relief'],
    },
    {
      hA: 'बाजार में आज सुबह भारी गिरावट के साथ कारोबार की शुरुआत हुई',
      hB: 'बीते कल रिकॉर्ड ऊंचाई पर बंद हुआ था शेयर बाजार',
      e: ['share-market'],
    }
  ];

  temporalConflictPairs.forEach((tc) => {
    pairs.push({
      id: nextId('TC'),
      headlineA: tc.hA,
      headlineB: tc.hB,
      entitiesA: tc.e,
      entitiesB: tc.e,
      pubDateA: '2026-10-21T08:00:00.000Z',
      pubDateB: '2026-10-21T18:00:00.000Z',
      language: /[\u0900-\u097F]/.test(tc.hA) ? 'hi' : 'en',
      category: 'temporal_conflict',
      expectedMerge: false,
    });
  });

  // 5. disjoint_entity: 15 pairs (expectedMerge: false)
  const disjointEntityPairs = [
    {
      hA: 'Keir Starmer pledges new national industrial strategy to boost manufacturing',
      hB: 'Emmanuel Macron outlines European competitiveness plan at Paris forum',
      eA: ['keir-starmer'], eB: ['emmanuel-macron'],
    },
    {
      hA: 'Donald Trump addresses energetic political rally in Pennsylvania stadium',
      hB: 'Kamala Harris speaks on reproductive freedom at Wisconsin campaign stop',
      eA: ['donald-trump'], eB: ['kamala-harris'],
    },
    {
      hA: 'Anthony Albanese discusses regional trade pact at summit in Tokyo',
      hB: 'Christopher Luxon meets bilateral partners on official visit to Singapore',
      eA: ['anthony-albanese'], eB: ['christopher-luxon'],
    },
    {
      hA: 'Justin Trudeau announces federal initiatives supporting clean technologies',
      hB: 'Pierre Poilievre criticizes carbon pricing policy at resource conference',
      eA: ['justin-trudeau'], eB: ['pierre-poilievre'],
    },
    {
      hA: 'Simon Harris defends government infrastructure spending in parliamentary address',
      hB: 'Mary Lou McDonald demands emergency funding for community healthcare services',
      eA: ['simon-harris'], eB: ['mary-lou-mcdonald'],
    },
    {
      hA: 'Rachel Reeves outlines fiscal framework for autumn spending commitments',
      hB: 'Jeremy Hunt questions sustainability of government tax policies in debate',
      eA: ['rachel-reeves'], eB: ['jeremy-hunt'],
    },
    {
      hA: 'Apple chief Tim Cook unveils spatial computing applications in keynote',
      hB: 'Microsoft CEO Satya Nadella demonstrates generative enterprise AI tools',
      eA: ['apple', 'tim-cook'], eB: ['microsoft', 'satya-nadella'],
    },
    {
      hA: 'Elon Musk announces expansion of SpaceX orbital launch facilities in Texas',
      hB: 'Jeff Bezos inspects commercial space station modules at Blue Origin facility',
      eA: ['spacex', 'elon-musk'], eB: ['blue-origin', 'jeff-bezos'],
    },
    {
      hA: 'Reserve Bank Governor Michele Bullock comments on wage growth dynamics',
      hB: 'European Central Bank President Christine Lagarde discusses euro area inflation',
      eA: ['rba', 'michele-bullock'], eB: ['ecb', 'christine-lagarde'],
    },
    {
      hA: 'Narendra Modi inaugurates international semiconductor summit in Greater Noida',
      hB: 'Rahul Gandhi addresses university students during youth interaction event',
      eA: ['narendra-modi'], eB: ['rahul-gandhi'],
    },
    {
      hA: 'Premier Danielle Smith announces energy deregulation measures in Edmonton',
      hB: 'Premier Doug Ford outlines infrastructure expansion priorities in Ontario',
      eA: ['danielle-smith'], eB: ['doug-ford'],
    },
    {
      hA: 'Novak Djokovic secures victory in opening round of international tennis tournament',
      hB: 'Jannik Sinner advances comfortably to second round with dominant serving display',
      eA: ['novak-djokovic'], eB: ['jannik-sinner'],
    },
    {
      hA: 'Lewis Hamilton qualifies on front row ahead of upcoming Grand Prix race',
      hB: 'Max Verstappen claims pole position with blistering final qualifying lap',
      eA: ['lewis-hamilton'], eB: ['max-verstappen'],
    },
    // Hindi disjoint entities (2)
    {
      hA: 'प्रधानमंत्री नरेंद्र मोदी ने नई राष्ट्रीय स्वास्थ्य योजना का शुभारंभ किया',
      hB: 'कांग्रेस नेता राहुल गांधी ने बेरोजगारी के मुद्दे पर सरकार को घेरा',
      eA: ['narendra-modi'], eB: ['rahul-gandhi'],
    },
    {
      hA: 'उत्तर प्रदेश के मुख्यमंत्री योगी आदित्यनाथ ने विकास परियोजनाओं का लोकार्पण किया',
      hB: 'दिल्ली के मुख्यमंत्री अरविंद केजरीवाल ने शिक्षा सुधारों पर प्रेस वार्ता की',
      eA: ['yogi-adityanath'], eB: ['arvind-kejriwal'],
    }
  ];

  disjointEntityPairs.forEach((de) => {
    pairs.push({
      id: nextId('DE-DISJ'),
      headlineA: de.hA,
      headlineB: de.hB,
      entitiesA: de.eA,
      entitiesB: de.eB,
      pubDateA: '2026-10-21T10:00:00.000Z',
      pubDateB: '2026-10-21T12:00:00.000Z',
      language: /[\u0900-\u097F]/.test(de.hA) ? 'hi' : 'en',
      category: 'disjoint_entity',
      expectedMerge: false,
    });
  });

  return pairs;
}

// Generate embeddings for all unique headlines
export function generateEmbeddings(pairs: BenchmarkHeadlinePair[]): Record<string, number[]> {
  const embeddings: Record<string, number[]> = {};

  // For each pair:
  // If same_event:
  //   Create base vector for pair.id
  //   hA has baseVec * 0.96 + indepA * 0.28
  //   hB has baseVec * 0.96 + indepB * 0.28
  //   Cosine will be >= 0.90!
  // If different_event:
  //   hA and hB have completely independent random vectors.
  //   Cosine will be ~0.0 to 0.4.
  // If round_conflict / temporal_conflict / disjoint_entity:
  //   Give them realistic vectors (can share baseVec * 0.90 + indep * 0.40, cosine ~ 0.83),
  //   so that the test proves the anti-merge guards prevent the merge even when headline similarity is high!
  for (const pair of pairs) {
    const trimmedA = pair.headlineA.trim();
    const trimmedB = pair.headlineB.trim();

    if (pair.category === 'same_event') {
      const baseVec = generateRandomUnitVector(`event-${pair.id}`);
      const indepA = generateRandomUnitVector(`headline-${trimmedA}`);
      const indepB = generateRandomUnitVector(`headline-${trimmedB}`);

      embeddings[trimmedA] = combineVectors(baseVec, indepA, 0.96, 0.28);
      embeddings[trimmedB] = combineVectors(baseVec, indepB, 0.96, 0.28);
    } else if (pair.category === 'different_event') {
      if (!embeddings[trimmedA]) {
        const indepA = generateRandomUnitVector(`headline-${trimmedA}`);
        embeddings[trimmedA] = Array.from(indepA);
      }
      if (!embeddings[trimmedB]) {
        const indepB = generateRandomUnitVector(`headline-${trimmedB}`);
        embeddings[trimmedB] = Array.from(indepB);
      }
    } else {
      // round_conflict, temporal_conflict, disjoint_entity
      // Share a base vector so cosine similarity is high (~0.85), proving that anti-merge guards block them!
      const baseVec = generateRandomUnitVector(`conflict-base-${pair.id}`);
      const indepA = generateRandomUnitVector(`headline-${trimmedA}`);
      const indepB = generateRandomUnitVector(`headline-${trimmedB}`);

      embeddings[trimmedA] = combineVectors(baseVec, indepA, 0.93, 0.35);
      embeddings[trimmedB] = combineVectors(baseVec, indepB, 0.93, 0.35);
    }
  }

  return embeddings;
}

// Main execution if run directly
async function main() {
  const pairs = createBenchmarkPairs();
  console.log(`Generated ${pairs.length} headline pairs.`);

  const categoryCounts: Record<string, number> = {};
  for (const p of pairs) {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  }
  console.log('Category distribution:', categoryCounts);

  const embeddings = generateEmbeddings(pairs);
  const uniqueHeadlines = Object.keys(embeddings).length;
  console.log(`Generated embeddings for ${uniqueHeadlines} unique headlines.`);

  const fixturesDir = path.resolve(process.cwd(), 'tests', 'fixtures', 'curation');
  fs.mkdirSync(fixturesDir, { recursive: true });

  const pairsPath = path.join(fixturesDir, 'headline-pairs.json');
  fs.writeFileSync(pairsPath, JSON.stringify(pairs, null, 2), 'utf8');
  console.log(`Wrote pairs to ${pairsPath}`);

  const embeddingsPath = path.join(fixturesDir, 'headline-embeddings.json');
  fs.writeFileSync(embeddingsPath, JSON.stringify(embeddings), 'utf8');
  console.log(`Wrote embeddings to ${embeddingsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
