// One realistic example of every source type in the editor (shared by the
// audit script and the test suite).
const A = (given, family) => ({ given, family });
const d = (...p) => ({ 'date-parts': [p] });
const acc = d(2026, 10, 26);
export const EXAMPLES = {
  website: { type: 'webpage', title: 'How green tea can help you lose weight', author: [A('Kris', 'Gunnars')], 'container-title': 'Healthline', issued: d(2023, 5, 12), accessed: acc, URL: 'https://www.healthline.com/nutrition/green-tea' },
  book: { type: 'book', title: 'Thinking, fast and slow', author: [A('Daniel', 'Kahneman')], publisher: 'Farrar, Straus and Giroux', 'publisher-place': 'New York', issued: d(2011), edition: '2' },
  chapter: { type: 'chapter', title: 'The ethics of care', author: [A('Joan', 'Tronto')], editor: [A('Virginia', 'Held')], 'container-title': 'Justice and care: Essential readings in feminist ethics', publisher: 'Routledge', 'publisher-place': 'London', issued: d(1995), page: '101-115' },
  journal: { type: 'article-journal', title: 'Deep learning', author: [A('Yann', 'LeCun'), A('Yoshua', 'Bengio'), A('Geoffrey', 'Hinton')], 'container-title': 'Nature', volume: '521', issue: '7553', page: '436-444', issued: d(2015, 5, 28), DOI: '10.1038/nature14539' },
  newspaper: { type: 'article-newspaper', title: 'Australia’s housing crisis deepens', author: [A('Jane', 'Smith')], 'container-title': 'The Sydney Morning Herald', issued: d(2024, 3, 14), URL: 'https://www.smh.com.au/national/housing-crisis', accessed: acc },
  magazine: { type: 'article-magazine', title: 'The age of AI', author: [A('Ross', 'Andersen')], 'container-title': 'The Atlantic', volume: '331', issue: '5', issued: d(2023, 6), page: '40-52' },
  video: { type: 'webpage', genre: 'Video', title: 'The power of vulnerability', author: [{ literal: 'TED' }], 'container-title': 'YouTube', issued: d(2011, 1, 3), URL: 'https://www.youtube.com/watch?v=iCvmsMzlF7o', accessed: acc },
  film: { type: 'motion_picture', genre: 'Film', title: 'Parasite', director: [A('Joon-ho', 'Bong')], publisher: 'CJ Entertainment', issued: d(2019) },
  tv: { type: 'broadcast', medium: 'TV series episode', title: 'The constant', 'container-title': 'Lost', number: 'Season 4, Episode 5', director: [A('Jack', 'Bender')], publisher: 'ABC', issued: d(2008, 2, 28) },
  podcast: { type: 'broadcast', medium: 'Audio podcast episode', title: 'The power of habits', author: [A('Shankar', 'Vedantam')], 'container-title': 'Hidden Brain', number: '120', publisher: 'NPR', issued: d(2021, 4, 12), URL: 'https://hiddenbrain.org/podcast/habits' },
  blog: { type: 'post-weblog', title: 'Software 2.0', author: [A('Andrej', 'Karpathy')], 'container-title': 'Medium', issued: d(2017, 11, 11), URL: 'https://karpathy.medium.com/software-2-0' },
  social: { type: 'post', title: 'We are excited to announce our new research findings on climate resilience', author: [{ literal: 'CSIRO' }], 'container-title': 'X', issued: d(2024, 2, 1), URL: 'https://x.com/CSIRO/status/1' },
  encyclopedia: { type: 'entry-encyclopedia', title: 'Photosynthesis', 'container-title': 'Encyclopaedia Britannica', issued: d(2024, 1, 10), URL: 'https://www.britannica.com/science/photosynthesis', accessed: acc },
  dictionary: { type: 'entry-dictionary', title: 'Resilience', 'container-title': 'Merriam-Webster dictionary', publisher: 'Merriam-Webster', URL: 'https://www.merriam-webster.com/dictionary/resilience', accessed: acc },
  report: { type: 'report', title: 'Mental health of young Australians', author: [{ literal: 'Australian Institute of Health and Welfare' }], publisher: 'AIHW', 'publisher-place': 'Canberra', number: 'PHE 307', issued: d(2023) },
  thesis: { type: 'thesis', title: 'Coastal erosion under changing climates', author: [A('Priya', 'Nair')], genre: 'Doctoral dissertation', publisher: 'University of Melbourne', issued: d(2021) },
  conference: { type: 'paper-conference', title: 'Attention is all you need', author: [A('Ashish', 'Vaswani'), A('Noam', 'Shazeer')], 'container-title': 'Advances in neural information processing systems 30', 'event-title': 'NeurIPS 2017', 'event-place': 'Long Beach, CA', publisher: 'Curran Associates', page: '5998-6008', issued: d(2017) },
  preprint: { type: 'article', title: 'Language models are few-shot learners', author: [A('Tom B.', 'Brown')], publisher: 'arXiv', number: 'arXiv:2005.14165', issued: d(2020), DOI: '10.48550/arXiv.2005.14165' },
  dataset: { type: 'dataset', title: 'Australian rainfall observations 1900–2020', author: [{ literal: 'Bureau of Meteorology' }], publisher: 'Bureau of Meteorology', version: '2.1', issued: d(2021), URL: 'http://www.bom.gov.au/climate/data' },
  software: { type: 'software', title: 'R: A language and environment for statistical computing', author: [{ literal: 'R Core Team' }], version: '4.3.1', publisher: 'R Foundation for Statistical Computing', issued: d(2023), URL: 'https://www.R-project.org' },
  image: { type: 'graphic', genre: 'Painting', title: 'The starry night', author: [A('Vincent', 'van Gogh')], medium: 'Oil on canvas', archive: 'Museum of Modern Art', 'archive-place': 'New York', issued: d(1889) },
  song: { type: 'song', genre: 'Song', title: 'Bohemian rhapsody', author: [{ literal: 'Queen' }], 'container-title': 'A night at the opera', publisher: 'EMI', issued: d(1975) },
  interview: { type: 'interview', title: 'Interview with a climate scientist', author: [A('Kate', 'Lee')], interviewer: [A('Sam', 'Patel')], medium: 'Personal interview', issued: d(2024, 5, 2) },
  speech: { type: 'speech', title: 'Apology to Australia’s Indigenous peoples', author: [A('Kevin', 'Rudd')], genre: 'Speech', 'event-title': 'Parliament of Australia', 'event-place': 'Canberra', issued: d(2008, 2, 13) },
  letter: { type: 'personal_communication', author: [A('Alex', 'Chen')], genre: 'Email to the author', issued: d(2024, 4, 3) },
  legislation: { type: 'legislation', title: 'Corporations Act', issued: d(2001), 'container-title': 'Cth' },
  bill: { type: 'bill', title: 'Climate Change Bill', issued: d(2022), 'container-title': 'Cth' },
  case: { type: 'legal_case', title: 'Mabo v Queensland (No 2)', issued: d(1992), volume: '175', 'container-title': 'Commonwealth Law Reports', 'container-title-short': 'CLR', page: '1' },
  patent: { type: 'patent', title: 'Method for detecting coral bleaching', author: [A('Li', 'Wang')], number: 'AU2020104567', authority: 'IP Australia', issued: d(2021, 6, 3) },
  map: { type: 'map', title: 'Topographic map of Tasmania', author: [{ literal: 'Geoscience Australia' }], genre: 'Map', publisher: 'Geoscience Australia', 'publisher-place': 'Canberra', issued: d(2019) },
  manuscript: { type: 'manuscript', title: 'Diary of a goldfields miner', author: [A('Thomas', 'Brown')], genre: 'Unpublished manuscript', archive: 'State Library Victoria', archive_location: 'MS 1234', issued: d(1853) },
  document: { type: 'document', title: 'Assessment guidelines', author: [{ literal: 'Monash University' }], publisher: 'Monash University', issued: d(2024), URL: 'https://www.monash.edu/assessment', accessed: acc },
};
export const STYLES = ['apa', 'modern-language-association', 'harvard-cite-them-right', 'chicago-author-date', 'chicago-notes-bibliography', 'australian-guide-to-legal-citation', 'ieee', 'nlm-citation-sequence'];
