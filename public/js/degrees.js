// Citation styles grouped by degree, so every student can find theirs fast.
// `styles` are the ones most used in that area (shown first, in this order);
// `fields` pull in every other style the CSL catalog tags with that subject.
// Shared by the style picker, the server's search, and the setup script.

export const DEGREES = [
  {
    id: 'law', label: 'Law', icon: 'law', fields: ['law'],
    styles: [
      ['australian-guide-to-legal-citation', 'AGLC 4th edition', 'Australia'],
      ['oscola', 'OSCOLA 4th edition', 'UK'],
      ['bluebook-law-review', 'Bluebook (law review)', 'US'],
      ['bluebook-inline', 'Bluebook (inline)', 'US'],
      ['mcgill-en', 'McGill Guide 10th edition', 'Canada'],
      ['australian-guide-to-legal-citation-3rd-edition', 'AGLC 3rd edition', 'Australia'],
      ['cambridge-university-press-law-note', 'Cambridge University Press (law, notes)'],
      ['chicago-notes-bibliography', 'Chicago 18th (notes & bibliography)'],
    ],
  },
  {
    id: 'health', label: 'Medicine & Health', icon: 'grad', fields: ['medicine'],
    styles: [
      ['nlm-citation-sequence', 'Vancouver (NLM, numbered)'],
      ['apa', 'APA 7th edition'],
      ['american-medical-association', 'AMA 11th edition'],
      ['harvard-cite-them-right', 'Harvard (Cite Them Right)'],
      ['nlm-name-year', 'NLM (author-date)'],
      ['elsevier-vancouver', 'Elsevier Vancouver'],
      ['bmj', 'BMJ'],
      ['the-lancet', 'The Lancet'],
      ['the-new-england-journal-of-medicine', 'New England Journal of Medicine'],
    ],
  },
  {
    id: 'nursing', label: 'Nursing & Allied Health', icon: 'grad', fields: ['medicine'],
    styles: [
      ['apa', 'APA 7th edition'],
      ['harvard-cite-them-right', 'Harvard (Cite Them Right)'],
      ['nlm-citation-sequence', 'Vancouver (NLM, numbered)'],
      ['royal-college-of-nursing-harvard', 'Royal College of Nursing (Harvard)'],
      ['american-medical-association', 'AMA 11th edition'],
      ['physiotherapy-theory-and-practice', 'Physiotherapy Theory and Practice'],
      ['australian-veterinary-journal', 'Australian Veterinary Journal'],
    ],
  },
  {
    id: 'psychology', label: 'Psychology', icon: 'chat', fields: ['psychology'],
    styles: [
      ['apa', 'APA 7th edition'],
      ['apa-annotated-bibliography', 'APA 7th (annotated bibliography)'],
      ['apa-6th-edition', 'APA 6th edition'],
      ['harvard-cite-them-right', 'Harvard (Cite Them Right)'],
    ],
  },
  {
    id: 'engineering', label: 'Engineering & IT', icon: 'code', fields: ['engineering'],
    styles: [
      ['ieee', 'IEEE'],
      ['harvard-cite-them-right', 'Harvard (Cite Them Right)'],
      ['apa', 'APA 7th edition'],
      ['association-for-computing-machinery', 'ACM'],
      ['springer-lecture-notes-in-computer-science', 'Springer LNCS (computer science)'],
      ['american-society-of-civil-engineers', 'ASCE (civil engineering)'],
      ['american-society-of-mechanical-engineers', 'ASME (mechanical engineering)'],
      ['american-institute-of-aeronautics-and-astronautics', 'AIAA (aerospace)'],
    ],
  },
  {
    id: 'science', label: 'Science', icon: 'flask', fields: ['science', 'biology', 'chemistry', 'physics', 'botany', 'zoology', 'geology', 'astronomy', 'math'],
    styles: [
      ['harvard-cite-them-right', 'Harvard (Cite Them Right)'],
      ['apa', 'APA 7th edition'],
      ['cse-name-year-8th-edition', 'CSE 8th (name-year)'],
      ['cse-citation-sequence-8th-edition', 'CSE 8th (citation-sequence)'],
      ['american-chemical-society', 'ACS (chemistry)'],
      ['royal-society-of-chemistry', 'Royal Society of Chemistry'],
      ['american-institute-of-physics', 'AIP (physics)'],
      ['american-physics-society', 'American Physical Society'],
      ['american-mathematical-society-numeric', 'AMS (mathematics)'],
      ['nature', 'Nature'],
      ['science', 'Science'],
      ['cell', 'Cell'],
      ['elsevier-harvard', 'Elsevier Harvard'],
    ],
  },
  {
    id: 'business', label: 'Business & Economics', icon: 'data', fields: [],
    styles: [
      ['harvard-cite-them-right', 'Harvard (Cite Them Right)'],
      ['apa', 'APA 7th edition'],
      ['chicago-author-date', 'Chicago 18th (author-date)'],
      ['elsevier-harvard', 'Elsevier Harvard'],
      ['academy-of-management-review', 'Academy of Management'],
      ['american-marketing-association', 'American Marketing Association'],
      ['journal-of-finance', 'Journal of Finance'],
      ['the-accounting-review', 'The Accounting Review'],
      ['strategic-management-journal', 'Strategic Management Journal'],
    ],
    keywords: ['business', 'economic', 'management', 'marketing', 'finance', 'accounting', 'tourism', 'commerce'],
  },
  {
    id: 'education', label: 'Education & Social Work', icon: 'grad', fields: [],
    styles: [
      ['apa', 'APA 7th edition'],
      ['harvard-cite-them-right', 'Harvard (Cite Them Right)'],
      ['chicago-author-date', 'Chicago 18th (author-date)'],
      ['the-british-journal-of-social-work', 'British Journal of Social Work'],
    ],
    keywords: ['education', 'teaching', 'social work', 'learning', 'pedagog'],
  },
  {
    id: 'humanities', label: 'Arts & Humanities', icon: 'pen', fields: ['humanities', 'literature', 'philosophy', 'linguistics'],
    styles: [
      ['modern-language-association', 'MLA 9th edition'],
      ['chicago-notes-bibliography', 'Chicago 18th (notes & bibliography)'],
      ['chicago-author-date', 'Chicago 18th (author-date)'],
      ['mhra-notes', 'MHRA (notes)'],
      ['mhra-author-date', 'MHRA (author-date)'],
      ['harvard-cite-them-right', 'Harvard (Cite Them Right)'],
      ['modern-language-association-annotated-bibliography', 'MLA 9th (annotated bibliography)'],
      ['unified-style-sheet-for-linguistics', 'Unified Style Sheet for Linguistics'],
      ['new-harts-rules-notes', 'New Hart’s Rules (Oxford, notes)'],
    ],
  },
  {
    id: 'history', label: 'History & Classics', icon: 'archive', fields: ['history'],
    styles: [
      ['chicago-notes-bibliography', 'Chicago 18th (notes & bibliography)'],
      ['chicago-shortened-notes-bibliography', 'Chicago 18th (shortened notes)'],
      ['turabian-notes-bibliography', 'Turabian 9th (notes & bibliography)'],
      ['mhra-notes', 'MHRA (notes)'],
      ['harvard-cite-them-right', 'Harvard (Cite Them Right)'],
      ['american-journal-of-archaeology', 'American Journal of Archaeology'],
    ],
  },
  {
    id: 'social', label: 'Social & Political Sciences', icon: 'globe', fields: ['social_science', 'sociology', 'political_science', 'anthropology', 'geography', 'communications'],
    styles: [
      ['apa', 'APA 7th edition'],
      ['harvard-cite-them-right', 'Harvard (Cite Them Right)'],
      ['american-sociological-association', 'ASA (sociology)'],
      ['american-political-science-association', 'APSA (political science)'],
      ['american-anthropological-association', 'AAA (anthropology)'],
      ['chicago-author-date', 'Chicago 18th (author-date)'],
      ['annals-of-the-association-of-american-geographers', 'AAG (geography)'],
    ],
  },
  {
    id: 'theology', label: 'Theology & Religion', icon: 'book', fields: ['theology'],
    styles: [
      ['society-of-biblical-literature-fullnote-bibliography', 'SBL (notes & bibliography)'],
      ['society-of-biblical-literature-author-date', 'SBL (author-date)'],
      ['chicago-notes-bibliography', 'Chicago 18th (notes & bibliography)'],
      ['turabian-notes-bibliography', 'Turabian 9th (notes & bibliography)'],
    ],
  },
  {
    id: 'government', label: 'Government & Policy', icon: 'building', fields: [],
    styles: [
      ['style-manual-australian-government', 'Australian Government Style Manual'],
      ['style-manual-australian-government-note', 'Australian Government Style Manual (notes)'],
      ['harvard-cite-them-right', 'Harvard (Cite Them Right)'],
      ['apa', 'APA 7th edition'],
      ['chicago-author-date', 'Chicago 18th (author-date)'],
    ],
    keywords: ['government', 'policy', 'public administration'],
  },
];

// Every style in a curated list, for pre-downloading
export const CURATED = [...new Set(DEGREES.flatMap(d => d.styles.map(s => s[0])))];
