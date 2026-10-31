export interface BriefSource {
  sourceName: string;
}

export interface StoryBrief {
  label: string;
  heading: string;
  sectionName: string;
  sourceHeading: string;
  contextAttribution: string;
  relatedPrefix: string;
  introduction: string;
  reportedContext: string | null;
  keyFacts: { label: string; value: string }[];
  coverage: string;
  disclosure: string;
}

interface StoryBriefInput {
  sectionName: string;
  publishedAt: string;
  excerpt: string | null;
  entities: string[];
  sources: BriefSource[];
  language: 'en' | 'hi';
}

function uniqueNames(sources: BriefSource[]): string[] {
  return [...new Set(sources.map((source) => source.sourceName).filter(Boolean))];
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

function hindiSectionName(sectionName: string): string {
  const names: Record<string, string> = {
    Politics: 'राजनीति', Business: 'व्यापार', Technology: 'तकनीक', Sport: 'खेल',
    Health: 'स्वास्थ्य', World: 'विश्व', Weather: 'मौसम', Entertainment: 'मनोरंजन',
  };
  return names[sectionName] ?? sectionName;
}

/** Builds a conservative, original brief without inventing facts beyond retained source material. */
export function buildStoryBrief(input: StoryBriefInput): StoryBrief {
  const outlets = uniqueNames(input.sources);
  const outletCount = outlets.length;
  const outletWord = outletCount === 1 ? 'outlet' : 'outlets';
  const sourcesLabel = outlets.slice(0, 3).join(', ');
  const moreOutlets = outletCount > 3 ? ` and ${outletCount - 3} more` : '';

  if (input.language === 'hi') {
    return {
      label: 'मेरिडियन समाचार-संक्षेपिका',
      heading: 'अब तक की बात',
      sectionName: hindiSectionName(input.sectionName),
      sourceHeading: 'मूल रिपोर्टिंग',
      contextAttribution: 'स्रोत से लिया गया अंश',
      relatedPrefix: 'इस संस्करण से और',
      introduction: `यह मेरिडियन की ${hindiSectionName(input.sectionName)} समाचार-संक्षेपिका है। नीचे मूल प्रकाशकों की रिपोर्टिंग और उनके सीधे लिंक दिए गए हैं।`,
      reportedContext: input.excerpt,
      keyFacts: [
        { label: 'प्रकाशित', value: new Intl.DateTimeFormat('hi-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(input.publishedAt)) },
        { label: 'कवरेज', value: `${outletCount} स्रोत: ${sourcesLabel}${moreOutlets}` },
        ...(input.entities.length ? [{ label: 'लोग और स्थान', value: input.entities.join(', ') }] : []),
      ],
      coverage: `मेरिडियन ने इस विषय पर उपलब्ध ${outletCount} स्रोतों की रिपोर्टिंग को एक जगह संगठित किया है।`,
      disclosure: 'यह स्वचालित समाचार-संक्षेपिका है। तथ्यात्मक संदर्भ स्रोत-अंश और नीचे लिंक की गई मूल रिपोर्टों तक सीमित है।',
    };
  }

  return {
    label: 'Automated Meridian Brief',
    heading: 'The story so far',
    sectionName: input.sectionName,
    sourceHeading: 'Original reporting',
    contextAttribution: 'Retained source excerpt',
    relatedPrefix: 'More',
    introduction: `This Meridian Brief brings together the available ${input.sectionName.toLowerCase()} reporting on this story. The original publishers and their full reports are linked below.`,
    reportedContext: input.excerpt,
    keyFacts: [
      { label: 'Published', value: dateLabel(input.publishedAt) },
      { label: 'Coverage', value: `${outletCount} ${outletWord}: ${sourcesLabel}${moreOutlets}` },
      ...(input.entities.length ? [{ label: 'People and places', value: input.entities.join(', ') }] : []),
    ],
    coverage: `Meridian has grouped the available reporting from ${outletCount} ${outletWord}. Read the linked original reports for full detail and later updates.`,
    disclosure: 'Automated Meridian Brief. Factual context is limited to the retained source excerpt and the original reports linked below.',
  };
}
