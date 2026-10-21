import type { Difficulty, InterviewMode } from '@career-prep/shared';
import type { GeneratedQuestion } from './schemas.js';

/**
 * Curated practice questions used when no AI provider is configured or the
 * provider is unavailable. Anything served from here is labelled
 * CURATED_FALLBACK, never as AI-generated.
 */

type BankEntry = Omit<GeneratedQuestion, 'difficulty'> & { levels: Difficulty[] };

const text = (
  questionText: string,
  topic: string,
  expectedAnswer: string,
  rubric: string[],
  levels: Difficulty[],
  hint: string | null = null,
): BankEntry => ({
  questionText,
  topic,
  answerFormat: 'TEXT',
  options: [],
  correctOptionIndex: null,
  expectedAnswer,
  rubric,
  hint,
  levels,
});

const mcq = (
  questionText: string,
  topic: string,
  options: string[],
  correctOptionIndex: number,
  expectedAnswer: string,
  levels: Difficulty[],
  hint: string | null = null,
): BankEntry => ({
  questionText,
  topic,
  answerFormat: 'MULTIPLE_CHOICE',
  options,
  correctOptionIndex,
  expectedAnswer,
  rubric: ['Selects the correct option', 'Explains the method used to reach it'],
  hint,
  levels,
});

const TECHNICAL: BankEntry[] = [
  text(
    'Explain the difference between an array and a linked list, and give one situation where you would choose each.',
    'Data structures',
    'Arrays give O(1) indexed access and better cache locality but costly inserts in the middle; linked lists give O(1) insert/delete given a node reference but O(n) access. Arrays suit lookup-heavy work, linked lists suit frequent insertion at known positions.',
    ['Names the access and insertion costs', 'Mentions memory layout or cache behaviour', 'Gives a concrete use case for each'],
    ['EASY', 'MEDIUM'],
    'Think about what each structure makes cheap and what it makes expensive.',
  ),
  text(
    'What does it mean for an operation to be O(n log n)? Name an algorithm with that complexity and say why.',
    'Complexity analysis',
    'The work grows proportionally to n multiplied by log n. Merge sort is the standard example: it halves the input log n times and does O(n) merging work at each level.',
    ['Explains the notation as growth rate, not runtime', 'Names a correct algorithm', 'Links the structure of the algorithm to the two factors'],
    ['EASY', 'MEDIUM', 'HARD'],
  ),
  text(
    'You have a REST endpoint that has become slow under load. Walk through how you would diagnose and fix it.',
    'Performance debugging',
    'Measure first: request tracing or timing to find where the time goes, then check database query plans and N+1 queries, payload size, external calls, and lock contention. Fix the dominant cost, then add caching or pagination if the access pattern justifies it, and verify with the same measurement.',
    ['Measures before changing anything', 'Names specific likely causes', 'Mentions verifying the fix', 'Avoids guessing at optimisations'],
    ['MEDIUM', 'HARD'],
    'Start with how you would find the bottleneck rather than what you would change.',
  ),
  text(
    'Explain what a database index does and when adding one can hurt rather than help.',
    'Databases',
    'An index is a separate ordered structure that lets the engine find rows without scanning the table. It costs storage and slows writes, because every insert or update must maintain it. Low-selectivity columns, very small tables, and write-heavy tables with rarely used indexes are cases where it hurts.',
    ['Explains the read benefit concretely', 'Names the write and storage cost', 'Gives a case where an index is a bad trade'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'What is the difference between authentication and authorisation? Give an example of getting authorisation wrong.',
    'Security fundamentals',
    'Authentication establishes who the caller is; authorisation decides what that identity may do. A common failure is checking only that a user is signed in before returning a record, without checking that the record belongs to them.',
    ['Separates identity from permission', 'Gives a realistic failure', 'Mentions server-side enforcement'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'Describe how you would design the data model for a simple blog with posts, authors, comments and tags.',
    'Data modelling',
    'Authors one-to-many posts; posts one-to-many comments; posts many-to-many tags through a join table. Foreign keys with sensible cascade rules, indexes on the foreign keys and on anything used for sorting such as published date.',
    ['Identifies the relationship cardinalities', 'Uses a join table for many-to-many', 'Mentions keys or indexes'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'What problem do database transactions solve, and what does an isolation level change?',
    'Databases',
    'Transactions make a group of operations atomic and durable, so partial work is never visible or persisted. Isolation level controls which concurrency anomalies are possible: dirty reads, non-repeatable reads and phantom reads, traded against throughput.',
    ['Explains atomicity in practical terms', 'Names at least one concurrency anomaly', 'Mentions the performance trade-off'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'How would you approach a bug that only reproduces in production?',
    'Debugging',
    'Gather facts first: logs, metrics, traces, the exact request and the differences between environments (data volume, configuration, concurrency, versions). Form one hypothesis at a time and test it with the cheapest safe check. Add observability if the data is missing rather than guessing.',
    ['Starts from evidence', 'Names concrete environment differences', 'Describes a single-hypothesis loop', 'Mentions adding observability where it is missing'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'Explain what an API contract is and how you would change one without breaking existing clients.',
    'API design',
    'The contract is the agreed request and response shape and behaviour. Change it additively: new optional fields, new endpoints or a new version; never remove or repurpose a field in place. Deprecate with a timeline and measure actual usage before removing anything.',
    ['Defines the contract clearly', 'Prefers additive change', 'Mentions versioning or deprecation'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'Walk me through one project from your resume: what you built, the hardest part, and what you would do differently.',
    'Project deep-dive',
    'A specific project with the candidate role made clear, a genuine technical difficulty with the reasoning behind the chosen approach, and a concrete, self-aware improvement.',
    ['Describes their own contribution specifically', 'Names a real difficulty with reasoning', 'Offers a concrete improvement', 'Avoids vague claims'],
    ['EASY', 'MEDIUM', 'HARD'],
  ),
  text(
    'Write (or describe precisely) a function that returns the first non-repeating character in a string. Explain the complexity.',
    'Problem solving',
    'Count occurrences in one pass with a hash map, then scan the string again in order and return the first character with count one. O(n) time, O(k) space for the alphabet. Edge cases: empty string, every character repeated.',
    ['Chooses a linear approach rather than nested loops', 'Preserves the original order', 'States the complexity', 'Mentions at least one edge case'],
    ['EASY', 'MEDIUM'],
    'Two passes are allowed, and often simpler than one.',
  ),
  text(
    'How would you design a URL shortener that handles a large volume of reads?',
    'System design',
    'Short key generation (counter plus base62 or a hash with collision handling), a key-to-URL store, a cache in front of reads because the workload is read-heavy, and a redirect with the right HTTP status. Discuss key length, collisions, expiry and analytics as separate concerns.',
    ['Separates write path from read path', 'Addresses key generation and collisions', 'Puts a cache where the read load is', 'Mentions a concrete scaling consideration'],
    ['HARD'],
  ),
  text(
    'What is the difference between unit, integration and end-to-end tests, and how would you divide tests across them?',
    'Testing',
    'Unit tests cover one piece of logic in isolation and run fast; integration tests cover the seams between components including real infrastructure; end-to-end tests exercise a user journey through the whole system. Most tests at the unit level, fewer integration tests on the risky seams, a small set of end-to-end tests over critical paths.',
    ['Distinguishes the three levels by scope', 'Proposes a sensible proportion', 'Links test choice to risk'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'Explain what happens, step by step, when a browser loads a page from your web application.',
    'Web fundamentals',
    'DNS resolution, TCP and TLS handshake, HTTP request, server handling and response, then parsing HTML, fetching sub-resources, building the DOM and rendering, with JavaScript execution and hydration where relevant. Caching can short-circuit several steps.',
    ['Covers network and rendering phases', 'Keeps the ordering correct', 'Mentions caching or a performance factor'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'What is idempotency and why does it matter for an API that charges money or sends messages?',
    'API design',
    'An idempotent operation produces the same result when repeated. Clients retry on timeouts, so without an idempotency key a retry can charge twice or send twice. The server stores the key with the result and returns the stored result for a repeat.',
    ['Defines idempotency correctly', 'Links it to retries', 'Describes a key-based mechanism'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'How do you decide whether to add a dependency or write the code yourself?',
    'Engineering judgement',
    'Weigh the size of the problem, the maintenance burden, the quality and activity of the library, its security and licensing, the size it adds, and how hard it would be to replace. Small, well-understood problems are often cheaper to own.',
    ['Names several concrete criteria', 'Considers maintenance and security, not just speed', 'Shows a defensible decision rule'],
    ['MEDIUM', 'HARD'],
  ),
];

const NON_TECHNICAL: BankEntry[] = [
  text(
    'You are given two tasks due on the same day and cannot finish both. How do you handle it?',
    'Prioritisation',
    'Clarify the real deadlines and impact, decide with evidence which matters more, tell the affected people early with a proposal rather than a problem, and offer a partial delivery or a revised date.',
    ['Gathers information before deciding', 'Communicates early and specifically', 'Proposes an option rather than escalating a problem'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'A teammate keeps missing agreed handover times and it is blocking your work. What do you do?',
    'Collaboration',
    'Speak to them directly and privately first, describe the impact rather than the character, ask what is getting in the way, agree a concrete change, and escalate only if the pattern continues.',
    ['Goes to the person first', 'Describes impact, not personality', 'Agrees a specific change', 'Escalates proportionately'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'You spot a mistake in work that has already been delivered to a customer. Walk me through your next hour.',
    'Ownership',
    'Confirm the mistake and its scope, tell the person who owns the customer relationship immediately, propose containment, then fix it and record what would prevent a repeat. Speed and honesty over self-protection.',
    ['Raises it immediately', 'Assesses scope before promising a fix', 'Separates containment from root cause', 'Takes responsibility without blame-shifting'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'How do you explain a complicated piece of work to someone who does not share your background?',
    'Communication',
    'Start from what they care about and what they already know, use one concrete example or analogy, avoid jargon or define it once, check understanding by asking them to restate the decision, and keep detail available but not upfront.',
    ['Starts from the audience, not the content', 'Uses a concrete example', 'Checks understanding actively'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'You disagree with a decision your manager has made. What do you do?',
    'Professional judgement',
    'Make sure the reasoning is understood first, then state the disagreement once, clearly, with evidence and a proposed alternative, privately. If the decision stands, commit to it and agree what evidence would prompt a review.',
    ['Seeks to understand the reasoning first', 'Disagrees with evidence and an alternative', 'Commits after the decision', 'Keeps it private and professional'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'Describe how you keep track of your work when several things are in progress.',
    'Time management',
    'A single list rather than several, explicit priorities, small enough pieces to finish, a regular review, and visible status so others do not have to ask.',
    ['Describes a concrete system', 'Explains how priorities get set', 'Mentions making status visible'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'A requirement you were given is ambiguous and the person who wrote it is unavailable for two days. What do you do?',
    'Situational judgement',
    'Write down the readings of the requirement and their consequences, do the work that is the same under every reading, pick the most likely interpretation for the rest and state the assumption in writing, then confirm when they return.',
    ['Makes progress rather than waiting', 'Documents the assumption explicitly', 'Separates what is safe from what is not'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'How do you handle being given work you do not know how to do?',
    'Learning',
    'Scope what is actually unknown, spend a bounded amount of time learning or prototyping, ask a specific question rather than a general one, and report progress and risk early.',
    ['Bounds the unknown', 'Uses a time-boxed approach', 'Asks specific questions', 'Communicates risk early'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'You join a project that is already behind schedule. What are your first steps?',
    'Situational judgement',
    'Understand the actual state and the critical path before offering opinions, find the biggest single cause of delay, identify what could be cut or deferred, and give the team and stakeholders one honest revised picture.',
    ['Gathers facts before acting', 'Looks for the dominant cause', 'Considers scope as a lever', 'Communicates honestly'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'Tell me about a time you had to decide with incomplete information.',
    'Decision making',
    'A specific situation, what was known and unknown, how the decision was bounded to limit the downside, what was decided and why, and what happened.',
    ['Specific rather than hypothetical', 'Explains how risk was limited', 'States the outcome honestly'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'How do you make sure work you hand over is actually usable by the next person?',
    'Collaboration',
    'Agree the interface or format up front, write down what is done and what is not, include how to run and verify it, and check in rather than assuming the handover landed.',
    ['Agrees expectations in advance', 'Documents state including gaps', 'Confirms the handover worked'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'A customer is frustrated about something that is not your fault. How do you respond?',
    'Customer focus',
    'Acknowledge the impact without arguing about blame, establish the facts, say what will happen next and by when, and follow up. Separate the relationship from the fault analysis.',
    ['Acknowledges impact first', 'Avoids blame-shifting', 'Gives a concrete next step', 'Follows up'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'What would make you stop work in progress and raise a concern?',
    'Professional judgement',
    'Anything with safety, legal, security, data-protection or serious financial consequences, or a plan that cannot succeed as specified. Raise it with specifics and a proposed alternative rather than a refusal.',
    ['Names concrete thresholds', 'Raises it constructively', 'Distinguishes serious risk from preference'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'How do you give someone feedback on work that is not good enough?',
    'Collaboration',
    'Privately, promptly, about the work and its effect rather than the person, with a specific example and a clear ask, then agree how to check the change.',
    ['Specific and timely', 'About the work, not the person', 'Includes a clear ask', 'Agrees follow-up'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'You realise halfway through a task that your approach will not work. What do you do?',
    'Problem solving',
    'Stop and confirm the approach genuinely cannot work, estimate the cost of changing versus continuing, tell whoever is depending on it, and restart with the knowledge gained rather than defending the original plan.',
    ['Verifies before abandoning', 'Compares costs explicitly', 'Communicates the change', 'Avoids sunk-cost reasoning'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'How do you decide when something is finished?',
    'Quality',
    'Against agreed criteria rather than personal feel: the requirement is met, it is verified, someone else can use or maintain it, and the known gaps are written down.',
    ['Uses agreed criteria', 'Includes verification', 'Accounts for handover and known gaps'],
    ['EASY', 'MEDIUM'],
  ),
];

const APTITUDE: BankEntry[] = [
  mcq(
    'A train covers 240 km in 3 hours. At the same speed, how long will it take to cover 400 km?',
    'Speed, distance and time',
    ['4 hours', '5 hours', '5 hours 30 minutes', '6 hours'],
    1,
    'Speed is 240 / 3 = 80 km/h. 400 / 80 = 5 hours.',
    ['EASY', 'MEDIUM'],
    'Find the speed first.',
  ),
  mcq(
    'An item costs 2,500. The price is increased by 20% and then reduced by 20%. What is the final price?',
    'Percentages',
    ['2,500', '2,400', '2,450', '2,520'],
    1,
    '2,500 x 1.2 = 3,000, then 3,000 x 0.8 = 2,400. Successive percentage changes do not cancel out.',
    ['EASY', 'MEDIUM'],
    'The second percentage applies to a larger number than the first.',
  ),
  mcq(
    'What is the next number in the sequence 2, 6, 12, 20, 30, ...?',
    'Number series',
    ['36', '40', '42', '44'],
    2,
    'The differences are 4, 6, 8, 10, so the next difference is 12 and the next term is 42. Equivalently n(n+1).',
    ['EASY', 'MEDIUM'],
    'Look at the gaps between consecutive terms.',
  ),
  mcq(
    'If 5 machines produce 500 units in 10 hours, how many units will 8 machines produce in 6 hours at the same rate?',
    'Work and rate',
    ['400', '480', '500', '600'],
    1,
    'One machine makes 500 / (5 x 10) = 10 units per hour. 8 machines x 6 hours x 10 = 480 units.',
    ['MEDIUM', 'HARD'],
    'Reduce it to the output of one machine in one hour.',
  ),
  mcq(
    'All engineers in a company know Python. Some people who know Python also know Go. Which statement must be true?',
    'Logical reasoning',
    [
      'Some engineers know Go',
      'All people who know Python are engineers',
      'Every engineer in the company knows Python',
      'No engineer knows Go',
    ],
    2,
    'Only the third restates the first premise. The others add information the premises do not support.',
    ['MEDIUM', 'HARD'],
    'Ask which option adds nothing beyond what was stated.',
  ),
  mcq(
    'The average of five numbers is 18. If one number is removed the average of the rest is 20. What was the removed number?',
    'Averages',
    ['8', '10', '12', '14'],
    1,
    'Total of five is 90. Total of the remaining four is 80. The removed number is 10.',
    ['MEDIUM', 'HARD'],
    'Work with totals rather than averages.',
  ),
  mcq(
    'A chart shows sales of 120, 150, 90 and 240 across four quarters. What share of the annual total came from Q4?',
    'Data interpretation',
    ['30%', '35%', '40%', '45%'],
    2,
    'The total is 600 and Q4 is 240, so 240 / 600 = 40%.',
    ['EASY', 'MEDIUM'],
  ),
  mcq(
    'If the day before yesterday was a Thursday, what day will it be the day after tomorrow?',
    'Calendar reasoning',
    ['Sunday', 'Monday', 'Tuesday', 'Wednesday'],
    1,
    'The day before yesterday was Thursday, so today is Saturday and the day after tomorrow is Monday.',
    ['EASY', 'MEDIUM'],
    'Fix today first.',
  ),
  mcq(
    'Choose the word that is most nearly opposite in meaning to "concise".',
    'Verbal reasoning',
    ['Brief', 'Verbose', 'Precise', 'Clear'],
    1,
    '"Concise" means saying much in few words; "verbose" means using more words than needed.',
    ['EASY', 'MEDIUM'],
  ),
  mcq(
    'A task takes one person 12 days. How long will it take three people working at the same rate?',
    'Work and rate',
    ['3 days', '4 days', '6 days', '9 days'],
    1,
    'Three people do three times the work per day, so 12 / 3 = 4 days.',
    ['EASY'],
  ),
  mcq(
    'A sum doubles in 8 years under simple interest. What is the annual rate?',
    'Interest',
    ['8%', '10%', '12.5%', '15%'],
    2,
    'Simple interest equal to the principal over 8 years means 100 = P x r x 8 / 100 with P = 100, so r = 12.5%.',
    ['MEDIUM', 'HARD'],
  ),
  mcq(
    'In a group of 60 people, 35 use the bus, 30 use the train and 12 use both. How many use neither?',
    'Set reasoning',
    ['5', '7', '10', '12'],
    1,
    'Bus or train is 35 + 30 - 12 = 53, so 60 - 53 = 7 use neither.',
    ['MEDIUM', 'HARD'],
    'Subtract the overlap once.',
  ),
  mcq(
    'What comes next: 3, 7, 16, 35, 74, ...?',
    'Number series',
    ['148', '151', '153', '160'],
    2,
    'Each term is double the previous plus an increasing odd number: 3x2+1=7, 7x2+2=16, 16x2+3=35, 35x2+4=74, 74x2+5=153.',
    ['HARD'],
  ),
  mcq(
    'A shop sells an item at a 25% loss for 1,500. What was the cost price?',
    'Profit and loss',
    ['1,875', '1,900', '2,000', '2,100'],
    2,
    'Selling price is 75% of cost, so cost = 1,500 / 0.75 = 2,000.',
    ['MEDIUM', 'HARD'],
  ),
  text(
    'Two pipes fill a tank in 12 and 18 minutes respectively. Both are opened together. How long does the tank take to fill? Show your method.',
    'Work and rate',
    'Rates add: 1/12 + 1/18 = 3/36 + 2/36 = 5/36 of the tank per minute, so the tank fills in 36/5 = 7.2 minutes (7 minutes 12 seconds).',
    ['Adds rates rather than times', 'Arrives at 7.2 minutes', 'Shows the working'],
    ['MEDIUM', 'HARD'],
    'Add how much each pipe does per minute.',
  ),
  text(
    'A report shows revenue up 10% and costs up 15% on a business that was breaking even. Explain what happened to profit and why.',
    'Data interpretation',
    'If revenue and costs were equal at the start, costs now exceed revenue, so the business moves from break-even into a loss of about 5% of the original revenue. The percentages apply to equal bases, so the larger cost increase dominates.',
    ['Recognises the equal starting base', 'Concludes a loss', 'Quantifies roughly and explains the reasoning'],
    ['MEDIUM', 'HARD'],
  ),
];

const HR: BankEntry[] = [
  text(
    'Tell me about yourself.',
    'Self-introduction',
    'A short, structured answer: what they do now, one or two relevant strengths with evidence, and why that leads to this role. Roughly a minute, relevant to the job rather than a life story.',
    ['Structured and concise', 'Relevant to the target role', 'Backed by specifics', 'Ends with why this role'],
    ['EASY', 'MEDIUM'],
    'Present, then relevant past, then why this role.',
  ),
  text(
    'Why do you want this role, and why at this kind of company?',
    'Motivation',
    'Specific reasons tied to the work itself and to the candidate direction, showing they know what the role involves. Not flattery and not purely about salary or convenience.',
    ['Specific to the role, not generic', 'Shows they understand the work', 'Connects to their own direction'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'What is your greatest strength, and how has it shown up in your work?',
    'Strengths',
    'One strength relevant to the role, with a concrete situation and result rather than an adjective list.',
    ['Picks one relevant strength', 'Gives a concrete example', 'States the effect it had'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'What is a weakness you are actively working on?',
    'Self-awareness',
    'A genuine weakness, the concrete steps being taken, and evidence of improvement. Not a disguised strength and not something disqualifying for the role.',
    ['Genuine rather than a humblebrag', 'Describes specific action taken', 'Shows evidence of change'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'Describe a time you disagreed with a colleague. Use the STAR structure: situation, task, action, result.',
    'Conflict resolution',
    'A real situation, their own responsibility, the specific steps they took to resolve it professionally, and the outcome including what they learned.',
    ['Follows situation, task, action, result', 'Focuses on their own actions', 'Resolution is professional', 'States a real outcome'],
    ['MEDIUM', 'HARD'],
    'Say what you did, not only what happened.',
  ),
  text(
    'Tell me about a time you received difficult feedback. What did you do with it?',
    'Handling feedback',
    'The feedback, the initial reaction honestly described, what they changed, and the result. Evidence of acting on it rather than only accepting it.',
    ['Describes the feedback specifically', 'Honest about their reaction', 'Shows a concrete change', 'States the result'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'Describe a time you worked in a team where something went wrong. What was your part in it?',
    'Teamwork',
    'A real failure, their own contribution owned without blaming the team, what they did about it, and what they do differently now.',
    ['Owns their own part', 'Avoids blaming others', 'Describes corrective action', 'Shows learning'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'Where do you want your career to be in three years, and how does this role fit?',
    'Career goals',
    'A direction rather than a job title, consistent with the role on offer, showing they have thought about what they want to be good at.',
    ['Has a coherent direction', 'Consistent with this role', 'Realistic about the timescale'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'Tell me about something you led or drove forward, even without a formal title.',
    'Leadership',
    'A specific initiative, why they picked it up, how they brought others along, and what changed as a result.',
    ['Specific initiative', 'Shows influence rather than authority', 'States a concrete outcome'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'Describe a time you had to adapt to a significant change at short notice.',
    'Adaptability',
    'The change, what it forced them to drop or redo, how they re-planned, and the result. Calm reprioritisation rather than complaint.',
    ['Describes the change concretely', 'Shows re-planning', 'States the outcome', 'Constructive tone'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'What kind of work environment brings out your best work?',
    'Fit',
    'Specific and honest conditions (feedback cadence, autonomy, collaboration style) rather than telling the interviewer what they want to hear, with awareness that no environment is perfect.',
    ['Specific and honest', 'Self-aware', 'Not purely flattering to the employer'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'Tell me about a time you failed to meet a commitment. What happened next?',
    'Accountability',
    'A real missed commitment, how and when they communicated it, what they did to limit the impact, and what they changed afterwards.',
    ['Honest about the miss', 'Communicated early', 'Limited the impact', 'Changed something afterwards'],
    ['MEDIUM', 'HARD'],
  ),
  text(
    'Why are you leaving your current role, or why did you leave your last one?',
    'Motivation',
    'A forward-looking reason focused on what they want next, factual about the past without criticising former colleagues or employers.',
    ['Forward-looking', 'Factual and professional about the past', 'Consistent with the role applied for'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'How do you stay motivated on work that is necessary but not interesting?',
    'Motivation',
    'A concrete strategy: connecting the work to an outcome that matters, breaking it up, setting a standard, or improving the process so it is less painful next time.',
    ['Gives a concrete strategy', 'Realistic rather than idealised', 'Shows reliability'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'What questions do you have about this role or the team?',
    'Engagement',
    'Two or three questions that show preparation and genuine interest in the work, the expectations and how success is judged.',
    ['Questions show preparation', 'Focused on the work and expectations', 'Not already answered in the description'],
    ['EASY', 'MEDIUM'],
  ),
  text(
    'Describe the achievement you are most proud of and why.',
    'Self-presentation',
    'A specific achievement with their own contribution clear, why it mattered, and what made it difficult.',
    ['Specific and verifiable in nature', 'Their own role is clear', 'Explains why it mattered'],
    ['EASY', 'MEDIUM'],
  ),
];

const BANK: Record<InterviewMode, BankEntry[]> = {
  TECHNICAL,
  NON_TECHNICAL,
  APTITUDE,
  HR,
};

/** Deterministic shuffle so a given seed always yields the same ordering. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    hash = (Math.imul(hash, 48271) + 11) | 0;
    const target = Math.abs(hash) % (index + 1);
    const a = out[index] as T;
    const b = out[target] as T;
    out[index] = b;
    out[target] = a;
  }
  return out;
}

/**
 * Picks curated questions for a mode, preferring the requested difficulty and
 * widening only if there are not enough. Never repeats within a session.
 */
export function curatedQuestions(
  mode: InterviewMode,
  difficulty: Difficulty,
  count: number,
  seed: string,
): GeneratedQuestion[] {
  const pool = BANK[mode];
  const preferred = seededShuffle(
    pool.filter((entry) => entry.levels.includes(difficulty)),
    seed,
  );
  const rest = seededShuffle(
    pool.filter((entry) => !entry.levels.includes(difficulty)),
    `${seed}-rest`,
  );

  return [...preferred, ...rest].slice(0, count).map(({ levels: _levels, ...entry }) => ({
    ...entry,
    difficulty,
  }));
}

export function curatedQuestionCount(mode: InterviewMode): number {
  return BANK[mode].length;
}
