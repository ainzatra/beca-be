import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from 'src/s3.service';
import pdfParse from 'pdf-parse';
class CleanCluster {
    id: string;
    text: string; // The sanitized cluster text
}

class ProcessedCluster {
    precinct_id: string;
    precincts: string; // e.g., "0001A, 0002A, ..."
    registered_voters: number | null;
    ballots_counted: number | null;
    candidates: Array<{
        name: string;
        votes: number | null;
        total: number | null;
    }>;
    barangay?: string;
    // Add more fields as needed (e.g., results_hash)
}
@Injectable()
export class LlmService {
    private readonly logger = new Logger(LlmService.name);
    private readonly openai: OpenAI;

    constructor(
        private readonly prisma: PrismaService,
        private readonly s3: S3Service,
    ) {
        this.openai = new OpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: process.env.OPENROUTER_API_KEY,
            maxRetries: 3,
        });
    }

    async countVotes(
        year: number,
        position: string,
        voteFiles: any[],
        precinctFile: any,
    ) {
        // Check if we already have data for this year and position
        const existing = await this.prisma.historyData.findFirst({
            where: { year: year.toString(), position },
        });
        if (existing) {
            const temp = position.split(' ');
            const capitalized = temp.map(
                (word) =>
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
            );
            console.log({ temp });
            throw new BadRequestException(
                `Data for ${year} ${capitalized.join(' ')} already exists.`,
            );
        }
        this.logger.log(`Starting vote counting for year ${year}`);

        const voteTexts: string[] = [];
        let precinctText: string;

        // Parse vote files (your original code)
        for (let i = 0; i < voteFiles.length; i++) {
            try {
                const dataBuffer = voteFiles[i].buffer;
                const data = await pdfParse(dataBuffer);
                voteTexts.push(data.text);
                this.logger.log(
                    `Parsed vote file ${i + 1}: ${data.text.length} characters`,
                );
            } catch (error) {
                this.logger.error(`Failed to parse vote file ${i + 1}:`, error);
                throw error;
            }
        }

        // Parse precinct file (assuming it's a single file; adjust if needed)
        try {
            const precinctBuffer = precinctFile.buffer; // Adjust path if needed
            const precinctData = await pdfParse(precinctBuffer);
            precinctText = precinctData.text;
            this.logger.log(
                `Parsed precinct file: ${precinctText.length} characters`,
            );
        } catch (error) {
            this.logger.error('Failed to parse precinct file:', error);
            throw error;
        }

        // Parse precincts to barangay-precinct mapping
        // const barangayPrecincts = this.parseBarangayPrecincts(precinctText);
        // this.logger.log(
        //     `Extracted barangay-precinct mapping: ${JSON.stringify(barangayPrecincts, null, 2)}`,
        // );

        const parsedBarangay = this.parseElectionPrecincts(precinctText);
        // console.log(
        //     'Prased barangay: ',
        //     JSON.stringify(parsedBarangay, null, 2),
        // );

        // Create reverse map: precinct -> barangay using parsedBarangay
        const precinctToBarangay = new Map<string, string>();
        for (const [barangay, precincts] of Object.entries(parsedBarangay)) {
            for (const precinct of precincts) {
                precinctToBarangay.set(precinct, barangay);
            }
        }

        // SANITIZATION: Extract clean clusters from all voteTexts
        const anchorRegex =
            /Clustered Precinct ID:\s*(\d+).*?(?=Results hash:\s*[A-Za-z0-9+/=]+)/gs;
        console.log('Number of parsed votes:', voteTexts.length);
        const voteResults: any = [];
        for (let i = 0; i < voteTexts.length; i++) {
            const cleanClusters: CleanCluster[] = [];
            const voteText = voteTexts[i];
            // const positionRegex =
            //     /STATEMENT OF VOTES BY PRECINCT FOR\s*(.*?)(?=\nMAY\s+\d{2},?\s+\d{4}|\nCopy for the Commission|\Z)/is;
            // // Extract position from header (after "FOR")
            // const positionMatch = voteText.match(positionRegex);
            // const position = positionMatch
            //     ? positionMatch[1]
            //           .trim()
            //           .replace(/\s+/g, ' ')
            //           .replace(/\n/g, ' ')
            //     : null;
            // if (position) {
            //     this.logger.log(
            //         `Extracted position from precinct file: "${position}"`,
            //     );
            // }
            let match;
            let clusterCount = 0;

            while ((match = anchorRegex.exec(voteText)) !== null) {
                const clusterId = match[1]; // Group 1: e.g., "14060001"
                let cleanClusterText = match[0]; // Full match (cluster block)

                // Post-filter: Remove any embedded headers/footers (rare, but for robustness)
                const headerRegex =
                    /Copy for the Commission.*?(?=Clustered Precinct ID:|\Z)/gs;
                cleanClusterText = cleanClusterText.replace(headerRegex, '');

                const footerRegex =
                    /(Report hash:|Software version:|OS Version:|System hash:|Results hash:).*?(?=\n|\Z)/gs;
                cleanClusterText = cleanClusterText.replace(footerRegex, '');

                // Normalize whitespace: Collapse multiple newlines, trim
                cleanClusterText = cleanClusterText
                    .replace(/\n\s*\n/g, '\n')
                    .trim();

                // Only add if it's substantial (e.g., has content after cleaning)
                if (cleanClusterText.length > 100) {
                    // Arbitrary threshold to skip empty matches
                    cleanClusters.push({
                        id: clusterId,
                        text: cleanClusterText,
                    });
                    clusterCount++;
                }
            }

            this.logger.log(
                `Extracted ${clusterCount} clean clusters from vote file ${i + 1}`,
            );
            if (clusterCount === 0) {
                this.logger.warn(
                    `No clusters found in vote file ${i + 1} – check for parsing issues or empty PDF.`,
                );
                // console.log('vote text without cluster', voteText);
            }

            const uniqueClusters = new Map();
            for (const cluster of cleanClusters) {
                if (!uniqueClusters.has(cluster.id)) {
                    uniqueClusters.set(cluster.id, cluster);
                }
            }
            const dedupedClusters: CleanCluster[] = Array.from(
                uniqueClusters.values(),
            );
            this.logger.log(
                `Deduplicated to ${dedupedClusters.length} unique clusters`,
            );
            this.logger.log(
                `Total unique clusters extracted across all files: ${dedupedClusters.length}`,
            );

            // TODO: Now process each cleanCluster for detailed extraction
            // Use the sub-regex or line-parsing flow from previous response
            const processedClusters: ProcessedCluster[] = [];
            for (const { id, text } of dedupedClusters) {
                // Example extraction (implement fully based on prior flow)
                // 1. Metadata regex
                const precinctsMatch = text.match(
                    /Precincts in a Cluster:\s*(.*?)(?=\nTotal Number|\Z)/s,
                );
                const precinctsStr = precinctsMatch
                    ? precinctsMatch[1].trim().replace(/[\s,]+$/g, '')
                    : null;

                const votersMatch = text.match(
                    /Total Number of Registered Voters:\s*(\d+)/,
                );
                const ballotsMatch = text.match(
                    /Total Number of Ballots Counted:\s*(\d+)/,
                );
                const registered_voters = votersMatch
                    ? parseInt(votersMatch[1], 10)
                    : null;
                const ballots_counted = ballotsMatch
                    ? parseInt(ballotsMatch[1], 10)
                    : null;

                // Determine barangay from precincts
                let barangay: string | undefined;
                if (precinctsStr) {
                    const individualPrecincts = precinctsStr
                        .split(/[\n,\s]+/)
                        .map((p) => p.trim())
                        .filter((p) => p && /\d+[A-B]?/.test(p));
                    const foundBarangays = individualPrecincts
                        .map((p) => precinctToBarangay.get(p))
                        .filter((b): b is string => !!b);
                    if (foundBarangays.length > 0) {
                        barangay = foundBarangays[0]; // Assume all from same barangay
                        // Optional: verify all match
                        if (foundBarangays.some((b) => b !== barangay)) {
                            this.logger.warn(
                                `Mixed barangays in cluster ${id}: ${foundBarangays.join(', ')}`,
                            );
                        }
                    }
                }

                // 2. Candidates: Use line-based parsing (as regex for tables is tricky)
                const candidates: ProcessedCluster['candidates'] = [];
                const lines = text.split('\n').filter((line) => line.trim());
                let i = 0;
                while (i < lines.length) {
                    const line = lines[i].trim();
                    if (/^\d+\./.test(line)) {
                        // Start of candidate: "1. NAME"
                        let name = line;
                        i++; // Move to next line
                        // Handle multiline names (e.g., "CABALQUINTO, RC" then "BUNAG (PFP)")
                        while (
                            i < lines.length &&
                            !/^\d+\./.test(lines[i]) &&
                            !/^\d+$/.test(lines[i].trim())
                        ) {
                            name += ' ' + lines[i].trim();
                            i++;
                        }
                        // Next: votes (number)
                        const votes =
                            i < lines.length && /^\d+$/.test(lines[i].trim())
                                ? parseInt(lines[i].trim(), 10)
                                : null;
                        i++;
                        // Next: total (number)
                        const total =
                            i < lines.length && /^\d+$/.test(lines[i].trim())
                                ? parseInt(lines[i].trim(), 10)
                                : null;
                        i++;

                        candidates.push({
                            name: name.replace(/^\d+\.\s*/, '').trim(),
                            votes,
                            total,
                        }); // Clean name
                    } else {
                        i++;
                    }
                }

                const cluster: ProcessedCluster = {
                    precinct_id: id,
                    precincts: precinctsStr || '',
                    registered_voters,
                    ballots_counted,
                    candidates,
                    barangay,
                };
                // console.log(cluster);
                processedClusters.push(cluster);
            }

            // TODO: Aggregate or count votes (e.g., sum across clusters)
            // Example: Total votes for a candidate across all clusters
            const totalVotesByCandidate = new Map<string, number>();
            console.log('Total cluster:', processedClusters.length);
            for (const cluster of processedClusters) {
                for (const cand of cluster.candidates) {
                    if (cand.votes) {
                        const key = cand.name.toLowerCase(); // Normalize for summing
                        totalVotesByCandidate.set(
                            key,
                            (totalVotesByCandidate.get(key) || 0) + cand.votes,
                        );
                    }
                }
            }
            // console.log(
            //     'Sample aggregated votes:',
            //     Object.fromEntries(totalVotesByCandidate),
            // );

            // Return processed data (adjust as needed for your app)
            // Aggregate votes per barangay per candidate
            const barangayVotes = new Map<string, Map<string, number>>();
            for (const cluster of processedClusters) {
                if (cluster.barangay) {
                    if (!barangayVotes.has(cluster.barangay)) {
                        barangayVotes.set(cluster.barangay, new Map());
                    }
                    const bMap = barangayVotes.get(cluster.barangay)!;
                    for (const cand of cluster.candidates) {
                        if (cand.votes) {
                            const key = cand.name.toLowerCase().trim(); // Normalize candidate name
                            bMap.set(key, (bMap.get(key) || 0) + cand.votes);
                        }
                    }
                }
            }

            // Convert to object for easier consumption
            const aggregated: Record<string, Record<string, number>> = {};
            for (const [bar, cMap] of barangayVotes) {
                aggregated[bar] = Object.fromEntries(cMap);
            }

            console.log(
                'Aggregated votes per barangay:',
                JSON.stringify(aggregated, null, 2),
            );
            if (Object.keys(aggregated).length === 0) {
                throw new BadRequestException(
                    `No votes extracted from vote file. Extraction may have failed.`,
                );
            }
            voteResults.push({
                year,
                total_clusters: processedClusters.length,
                // clusters: processedClusters,
                votes: aggregated,
                // type: position,
                // Optionally include precinctText for further processing
            });
        }

        // voteResults.forEach((result, index) => {
        //     console.log(
        //         `File ${index} Results:`,
        //         JSON.stringify(result, null, 2),
        //     );
        // });

        await this.prisma.historyData.create({
            data: { year: year.toString(), position, json: voteResults[0] },
        });
        return voteResults;
    }

    private parseElectionPrecincts(text: string): Record<string, string[]> {
        // Known barangays from the document (hardcoded for accuracy to avoid detection issues)
        const knownBarangays = new Set([
            'POBLACION',
            'BONGA MAYOR',
            'BONGA MENOR',
            'BUISAN',
            'CAMACHILIHAN',
            'CAMBAOG',
            'CATACTE',
            'LICIADA',
            'MALAMIG',
            'MALAWAK',
            'SAN PEDRO',
            'TALAMPAS',
            'TANAWAN',
            'TIBAGAN',
        ]);

        // Step 1: Sanitization - Less aggressive to preserve barangay and cluster lines
        let sanitized = text
            .replace(
                /^(Date:|Page \d+ of \d+|HASH: .*|VERSION: .*|\d{2}-\w{3}-\d{2} \d{2}:\d{2}:\d{2}\.\d+ (AM|PM)|SUBTOTAL\d*|Total No\. of .*:.*|Election Officer.*|I hereby certify.*|^\s*$|Republic of the Philippines.*|COMMISSION ON ELECTIONS.*|P R O J E C T  O F  P R E C I N C T.*|MAY 12, 2025.*|NATIONAL, LOCAL AND BARMM PARLIAMENTARY ELECTIONS.*|CITY \/ MUNICIPALITY : BUSTOS.*|PROVINCE : BULACAN.*)/gim,
                '',
            )
            .trim();

        // Remove fragmented headers (specific phrases)
        const fragmentRegex =
            /^(GROUP|NUMBER|GROUPED|PRECINCT|VOTERS AFTER|GROUPING|ESTABLISHED|CLUSTER\/|TOTAL NO\.|REGISTERED|NAME AND ADDRESS|OF VOTING CENTER|BARANGAY|CLUSTERED\/GROUPED|ESTABLISHED PRECINCT)/gim;
        sanitized = sanitized.replace(fragmentRegex, '').trim();

        // Remove voting center addresses/school names (more precise: must contain key words)
        const addressRegex =
            /\b(SCHOOL|ELEMENTARY|DAYCARE|CENTER|DR\. RAMIREZ|LEARNING|.*BUSTOS,\s*BULACAN)\b.*$/gim;
        sanitized = sanitized.replace(addressRegex, '').trim();

        // Remove standalone voter counts/numbers (pure lines)
        const numberRegex = /^(\d{1,4}(,\d{3})?|\d{4,5})$/gm; // Catches "136", "1980", "633544"
        sanitized = sanitized.replace(numberRegex, '').trim();

        // NO CLUSTER REMOVAL - Parse them later

        // Split into lines, trim, filter minimally (keep most, skip only empty or pure long numbers)
        const lines = sanitized
            .split('\n')
            .map((line) => line.replace(/\s+/g, ' ').trim()) // Normalize spaces
            .filter(
                (line) =>
                    line.length > 0 &&
                    !/^\d{4,}$/.test(line) &&
                    line.length < 100,
            ); // Skip pure long numbers, but keep precincts/clusters

        console.log('Lines after sanitization:', lines.length); // DEBUG: How many lines?
        console.log('Sample lines:', lines.slice(0, 10)); // DEBUG: First 10 lines to check

        // Step 2: Looser barangay detection
        const barangayRegex = /^[A-Z\s]{3,50}$/; // All uppercase letters/spaces, 3+ chars

        // Step 3: Precinct extraction - Only exact 4 digits + A/B/C (reject S or others)
        const extractPrecinctsRegex = /(\d{4}[A-C]?)/g; // A-Z but limited to A/B/C based on text

        const result = new Map<string, Set<string>>();
        let currentBarangay = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim().toUpperCase();

            // Check for barangay - loose regex + whitelist validation
            if (barangayRegex.test(line)) {
                let candidate = line.replace(/\s+/g, ' ').trim(); // Normalize

                // Check if it matches a known barangay (exact or close: e.g., "BONGA MAYOR" as is)
                let isValidBarangay = false;
                for (const known of knownBarangays) {
                    if (
                        candidate.includes(known.split(' ')[0]) ||
                        candidate === known ||
                        (known.includes(' ') &&
                            candidate === known.replace(' ', ' '))
                    ) {
                        // Handle space issues
                        candidate = known; // Standardize to exact known name
                        isValidBarangay = true;
                        break;
                    }
                }

                // Fallback: If not in whitelist, skip unless it looks very likely (e.g., not blacklisted short word)
                const blacklistedWords = new Set([
                    'GROUP',
                    'NUMBER',
                    'GROUPED',
                    'PRECINCT',
                    'VOTERS',
                    'AFTER',
                    'GROUPING',
                    'ESTABLISHED',
                    'CLUSTER',
                    'TOTAL',
                    'REGISTERED',
                    'NAME',
                    'ADDRESS',
                    'ELEMENTARY',
                    'BULACAN',
                ]);
                if (!isValidBarangay) {
                    if (
                        blacklistedWords.has(candidate) ||
                        candidate.length < 5 ||
                        !/[A-Z]{3,}/.test(candidate)
                    ) {
                        continue; // Skip obvious fragments
                    }
                    // Still skip if not known - log for debug
                    // console.log(
                    //     `Possible barangay skipped: ${candidate} (line ${i})`,
                    // ); // DEBUG
                    continue;
                }

                // Valid barangay found
                // console.log(`Detected barangay: ${candidate} (line ${i})`); // DEBUG
                if (currentBarangay) {
                    // Save previous (populate its set if not already)
                    if (!result.has(currentBarangay)) {
                        result.set(currentBarangay, new Set());
                    }
                }
                currentBarangay = candidate;
            } else if (currentBarangay) {
                // Extract precincts if line looks promising (contains digits + letters or comma)
                if (line.match(/\d{4}[A-Z]/) || line.includes(',')) {
                    const matches = line.match(extractPrecinctsRegex);
                    if (matches) {
                        let precinctSet = result.get(currentBarangay);
                        if (!precinctSet) {
                            precinctSet = new Set();
                            result.set(currentBarangay, precinctSet);
                        }
                        let addedCount = 0;
                        matches.forEach((potential) => {
                            const cleanPrecinct = potential
                                .trim()
                                .replace(/[^0-9A-Z]/g, '');
                            // Strict validation: Exactly 4 digits + 1 A/B/C (no S, no shorter/longer)
                            if (cleanPrecinct.match(/^\d{4}[ABC]$/)) {
                                if (precinctSet.add(cleanPrecinct)) {
                                    addedCount++;
                                }
                            } else {
                                // console.log(
                                //     `Invalid precinct skipped: ${potential} -> ${cleanPrecinct} (in ${currentBarangay})`,
                                // ); // DEBUG: Catches "5831S"
                            }
                        });
                        if (addedCount > 0) {
                            // console.log(
                            //     `Added ${addedCount} precincts to ${currentBarangay}: [${Array.from(precinctSet).slice(-addedCount).join(', ')}]`,
                            // ); // DEBUG sample
                        }
                    }
                }
            }
        }

        // Handle last barangay
        if (currentBarangay && knownBarangays.has(currentBarangay)) {
            if (!result.has(currentBarangay)) {
                result.set(currentBarangay, new Set());
            }
        }

        console.log(`Total detected barangays: ${result.size}`); // DEBUG
        console.log(
            `Total precincts across all: ${Array.from(result.values()).reduce((sum, set) => sum + set.size, 0)}`,
        ); // DEBUG

        // Convert to Record - sort, filter empties
        const obj: Record<string, string[]> = {};
        for (const [barangay, precinctSet] of result) {
            const precincts = Array.from(precinctSet).sort();
            if (precincts.length > 0) {
                obj[barangay] = precincts;
            }
        }

        return obj;
    }

    async analyzeSurveyResponses(
        phaseData: any,
        campaignTitle: string,
        completedPhase: string,
        campaignId: string,
        previousReports?: any,
        candidateName?: string,
        candidateParty?: string,
        candidatePosition?: string,
    ) {
        // Fetch Facebook data for the campaign and phase
        const facebookPosts = await this.prisma.facebookPost.findMany({
            where: {
                campaignId,
                phase: completedPhase as any,
            },
            include: {
                facebookComments: true,
            },
        });

        const facebookData = facebookPosts.map((post) => ({
            content: post.content,
            likes: post.likes,
            shares: post.shares,
            commentsCount: post.commentsCount,
            comments: post.facebookComments.map((comment) => ({
                content: comment.content,
                authorName: comment.authorName,
                likes: comment.likes,
                replies: comment.replies,
            })),
        }));

        // Analyze Facebook data separately
        const facebookAnalysis = await this.analyzeFacebookData(
            facebookData,
            campaignTitle,
            completedPhase,
            candidateName,
            candidateParty,
            candidatePosition,
        );

        // Collect all survey responses
        const allResponses: any[] = [];
        phaseData.forEach((survey: any) => {
            allResponses.push(...survey.responses);
        });
        const totalInputResponses = allResponses.length;
        console.log(`Total input responses: ${totalInputResponses}`);

        // Batch responses (e.g., 10 per batch)
        const batchSize = 10;
        const batches: any[][] = [];
        for (let i = 0; i < allResponses.length; i += batchSize) {
            batches.push(allResponses.slice(i, i + batchSize));
        }

        // Analyze each batch concurrently
        const batchPromises = batches.map((batch, index) =>
            this.analyzeSurveyBatch(
                batch,
                index + 1,
                phaseData,
                campaignTitle,
                completedPhase,
                facebookAnalysis.summary,
                candidateName,
                candidateParty,
                candidatePosition,
                previousReports,
            ),
        );
        const batchResults = await Promise.all(batchPromises);

        // Merge batch results
        const mergedTopIssues: Map<string, any> = new Map();
        let combinedSummary = facebookAnalysis.summary + '\n\n';
        let totalConfidence = facebookAnalysis.confidence;

        // Collect sentiments from AI
        const sentimentMap: Map<string, string> = new Map();
        batchResults.forEach((result, index) => {
            combinedSummary += `Batch ${index + 1}: ${result.summary}\n`;
            totalConfidence += result.confidence;

            // Merge topIssues
            result.topIssues.forEach((issue: any) => {
                const key = issue.issue.toLowerCase();
                if (mergedTopIssues.has(key)) {
                    const existing = mergedTopIssues.get(key);
                    existing.responses = [
                        ...new Set([...existing.responses, ...issue.responses]),
                    ];
                    // Update sentiment/trend if needed (simple: keep first)
                } else {
                    mergedTopIssues.set(key, { ...issue });
                }
            });

            // Collect sentiments by responseId
            result.locationSentiment.forEach((loc: any) => {
                loc.sentiments.forEach((s: any) => {
                    sentimentMap.set(s.responseId, s.sentiment);
                });
            });
        });

        // Average confidence
        const averageConfidence = Math.round(
            totalConfidence / (batchResults.length + 1),
        );

        // Convert merged maps to arrays
        const finalTopIssues = Array.from(mergedTopIssues.values()).map(
            (issue) => ({
                ...issue,
                mentions: issue.responses.length,
            }),
        );

        // Group by actual address from database
        const locationGroups: Map<string, any[]> = new Map();
        allResponses.forEach((response) => {
            const location = response.address || 'Unknown';
            if (!locationGroups.has(location)) {
                locationGroups.set(location, []);
            }
            locationGroups.get(location)!.push({
                responseId: response.id,
                sentiment: sentimentMap.get(response.id) || 'neutral',
            });
        });

        const finalLocationSentiment: any[] = Array.from(
            locationGroups.entries(),
        ).map(([location, sentiments]) => ({
            location,
            sentiments,
        }));

        // Count sentiments
        let totalResponses = 0;
        let positive = 0;
        let negative = 0;
        let neutral = 0;
        finalLocationSentiment.forEach((loc) => {
            loc.positive = 0;
            loc.negative = 0;
            loc.neutral = 0;
            loc.sentiments.forEach((s) => {
                totalResponses++;
                switch (s.sentiment) {
                    case 'positive':
                        loc.positive++;
                        positive++;
                        break;
                    case 'negative':
                        loc.negative++;
                        negative++;
                        break;
                    case 'neutral':
                        loc.neutral++;
                        neutral++;
                        break;
                }
            });
        });

        // Generate final cohesive summary
        const finalSummary = await this.generateFinalSummary(
            facebookAnalysis.summary,
            finalTopIssues,
            finalLocationSentiment,
            averageConfidence,
            campaignTitle,
            completedPhase,
            candidateName,
            candidateParty,
            candidatePosition,
            previousReports,
        );

        const finalResult = {
            summary: finalSummary,
            confidence: averageConfidence,
            topIssues: finalTopIssues,
            locationSentiment: finalLocationSentiment,
            totalResponses,
            positive,
            negative,
            neutral,
        };

        this.logger.log('Survey analysis completed successfully');
        return finalResult;
    }
    private async analyzeFacebookData(
        facebookData: any[],
        campaignTitle: string,
        completedPhase: string,
        candidateName?: string,
        candidateParty?: string,
        candidatePosition?: string,
    ) {
        if (facebookData.length === 0) {
            return {
                summary: 'No Facebook data available for this phase.',
                confidence: 50,
                topIssues: [],
                locationSentiment: [],
            };
        }

        const systemPrompt = `You are an expert AI analyst for election campaign social media data. Analyze the provided Facebook posts and comments from the completed campaign phase for public sentiment, issues, and engagement.

Key Analysis:
- Sentiments: Analyze comments for public sentiment trends (positive/neutral/negative) towards the candidate/election. Summarize overall sentiment.
- Group by location: Note any location mentions in comments (e.g., barangay, city). Group sentiments by location if mentioned.
- Top Issues: Identify 3-5 key issues from posts/comments (content, engagement). For each: name, engagement metrics (likes, shares, comments), majority sentiment, trend (up/down/flat).
- Performance: Estimate confidence score (0-100) based on engagement and sentiment.
- Summary: Concise 100-150 word narrative on public sentiment, issues, and trends.

Input:
- Facebook Data: Array of {content, likes, shares, commentsCount, comments: [{content, authorName, likes, replies}]}
- Campaign: "${campaignTitle}"
- Candidate Name: "${candidateName || 'N/A'}"
- Party: "${candidateParty || 'N/A'}"
- Position: "${candidatePosition || 'N/A'}"
- Phase: "${completedPhase}"

Output ONLY valid JSON:
{
    "summary": "Narrative summary...",
    "confidence": number (0-100),
    "topIssues": [
        {
            "issue": "string",
            "engagement": { "likes": number, "shares": number, "comments": number },
            "sentiment": "Positive" | "Negative" | "Neutral",
            "trend": "up" | "down" | "flat"
        }
    ],
    "locationSentiment": [
        {
            "location": "string",
            "sentiments": [
                {
                    "sentiment": "positive" | "neutral" | "negative",
                    "count": number
                }
            ]
        }
    ]
}`;

        const userPrompt = `Facebook Data: ${JSON.stringify(facebookData, null, 2)}`;

        let parsed;
        let retries = 0;
        const maxRetries = 3;
        while (retries < maxRetries) {
            try {
                this.logger.log(
                    `Starting Facebook analysis LLM call for phase ${completedPhase}${retries > 0 ? ` (retry ${retries})` : ''}`,
                );
                const completion = await this.openai.chat.completions.create({
                    model: 'x-ai/grok-4-fast',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.3,
                });

                if (completion.usage) {
                    this.logger.log(
                        `Facebook LLM tokens: prompt ${completion.usage.prompt_tokens}, completion ${completion.usage.completion_tokens}, total ${completion.usage.total_tokens}`,
                    );
                }
                const content = completion.choices[0].message.content;
                if (!content)
                    throw new Error('No content in Facebook LLM response');
                parsed = JSON.parse(content);
                this.logger.log(
                    'Facebook analysis LLM call completed successfully',
                );
                break;
            } catch (error) {
                if (
                    error instanceof SyntaxError &&
                    error.message.includes('Unexpected end of JSON input')
                ) {
                    retries++;
                    if (retries < maxRetries) {
                        this.logger.warn(
                            `JSON parse failed, retrying (${retries}/${maxRetries})`,
                        );
                        continue;
                    }
                }
                this.logger.error('Error in analyzeFacebookData:', error);
                throw error;
            }
        }
        return parsed;
    }

    private async analyzeSurveyBatch(
        batchResponses: any[],
        batchIndex: number,
        phaseData: any,
        campaignTitle: string,
        completedPhase: string,
        facebookSummary?: string,
        candidateName?: string,
        candidateParty?: string,
        candidatePosition?: string,
        previousReports?: any,
    ) {
        const systemPrompt = `You are an expert AI analyst for election campaign surveys. Analyze the provided survey responses from the completed campaign phase. Combine with Facebook insights if provided.

Important: Question IDs are random. Use 'questionTitle' to identify types. Analyze for sentiments, issues, trends.

Key Analysis:
- Sentiments: Classify each respondent's overall sentiment (positive/neutral/negative) based on open responses. Provide for each response ID.
- Group by location: Extract from 'address' field, normalize to city/barangay (e.g., "Bustos, Bulacan" -> "Bustos"). Examples: "Barangay Poblacion, Bustos" -> "Poblacion"; "123 Main St, Barangay 1, Manila" -> "Barangay 1, Manila". If empty/null/cannot normalize, use "Unknown". Ensure ALL responses are included.
- Top Issues: Identify 3-5 key issues from responses. For each: name, response IDs that mentioned it, majority sentiment, trend (up/down/flat vs previous if provided).
- Performance: Infer confidence (0-100) from likelihood, sources, qualities.
- Summary: Concise 150-250 word narrative on sentiments, issues, trends, recommendations. Compare to previous if provided. Incorporate Facebook summary if given.

Input:
- Surveys: Array of {title, form: [{id, title: questionTitle, type, options, required}], responses: batch subset}
- Campaign: "${campaignTitle}"
- Candidate Name: "${candidateName || 'N/A'}"
- Party: "${candidateParty || 'N/A'}"
- Position: "${candidatePosition || 'N/A'}"
- Phase: "${completedPhase}"
- Facebook Summary: "${facebookSummary || 'None'}"
- Previous Report: ${previousReports?.length > 0 ? JSON.stringify(previousReports, null, 2) : 'None'}

Output ONLY valid JSON:
{
    "summary": "Narrative summary...",
    "confidence": number (0-100),
    "topIssues": [
        {
            "issue": "string",
            "responses": ["responseId1"],
            "sentiment": "Positive" | "Negative" | "Neutral",
            "trend": "up" | "down" | "flat"
        }
    ],
    "locationSentiment": [
        {
            "location": "string",
            "sentiments": [
                {
                    "responseId": "string",
                    "sentiment": "positive" | "neutral" | "negative"
                }
            ]
        }
    ]
}`;

        const userPrompt = `Phase Surveys Data: ${JSON.stringify(phaseData, null, 2)}
Batch Responses: ${JSON.stringify(batchResponses, null, 2)}`;

        let parsed;
        let retries = 0;
        const maxRetries = 3;
        while (retries < maxRetries) {
            try {
                this.logger.log(
                    `Batch ${batchIndex}: Starting survey batch LLM call for ${batchResponses.length} responses${retries > 0 ? ` (retry ${retries})` : ''}`,
                );
                const completion = await this.openai.chat.completions.create({
                    model: 'x-ai/grok-4-fast',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.3,
                });

                if (completion.usage) {
                    this.logger.log(
                        `Batch ${batchIndex}: Batch LLM tokens: prompt ${completion.usage.prompt_tokens}, completion ${completion.usage.completion_tokens}, total ${completion.usage.total_tokens}`,
                    );
                }
                const content = completion.choices[0].message.content;
                if (!content)
                    throw new Error('No content in batch LLM response');
                parsed = JSON.parse(content);
                this.logger.log(
                    `Batch ${batchIndex}: Survey batch LLM call completed successfully`,
                );
                break;
            } catch (error) {
                if (
                    error instanceof SyntaxError &&
                    error.message.includes('Unexpected end of JSON input')
                ) {
                    retries++;
                    if (retries < maxRetries) {
                        this.logger.warn(
                            `JSON parse failed, retrying (${retries}/${maxRetries})`,
                        );
                        continue;
                    }
                }
                this.logger.error(
                    `Error in Batch ${batchIndex} analyzeSurveyBatch:`,
                    error,
                );
                throw error;
            }
        }
        return parsed;
    }
    private async generateFinalSummary(
        facebookSummary: string,
        mergedTopIssues: any[],
        mergedLocationSentiment: any[],
        averageConfidence: number,
        campaignTitle: string,
        completedPhase: string,
        candidateName?: string,
        candidateParty?: string,
        candidatePosition?: string,
        previousReports?: any,
    ) {
        const systemPrompt = `You are an expert AI analyst synthesizing election campaign reports. Given Facebook analysis and merged survey data, create a cohesive final summary narrative.

Key Requirements:
- Combine Facebook public sentiment with survey sentiments.
- Highlight key issues, location trends, and overall confidence.
- Compare to previous reports if provided.
- Provide 200-300 word narrative for non-technical readers, focusing on qualitative insights, sentiments, issues, trends, and recommendations.

Input:
- Facebook Summary: "${facebookSummary}"
- Merged Top Issues: ${JSON.stringify(mergedTopIssues)}
- Merged Location Sentiment: ${JSON.stringify(mergedLocationSentiment)}
- Average Confidence: ${averageConfidence}
- Campaign: "${campaignTitle}"
- Candidate Name: "${candidateName || 'N/A'}"
- Party: "${candidateParty || 'N/A'}"
- Position: "${candidatePosition || 'N/A'}"
- Phase: "${completedPhase}"
- Previous Report: ${previousReports?.length > 0 ? JSON.stringify(previousReports, null, 2) : 'None'}

Output ONLY valid JSON:
{
    "finalSummary": "Cohesive narrative summary..."
}`;

        const userPrompt = `Synthesize the above data into a final report summary.`;

        let parsed;
        let retries = 0;
        const maxRetries = 3;
        while (retries < maxRetries) {
            try {
                this.logger.log(
                    `Starting final summary LLM call${retries > 0 ? ` (retry ${retries})` : ''}`,
                );
                const completion = await this.openai.chat.completions.create({
                    model: 'x-ai/grok-4-fast',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.3,
                });

                if (completion.usage) {
                    this.logger.log(
                        `Final summary LLM tokens: prompt ${completion.usage.prompt_tokens}, completion ${completion.usage.completion_tokens}, total ${completion.usage.total_tokens}`,
                    );
                }
                const content = completion.choices[0].message.content;
                if (!content)
                    throw new Error('No content in final summary LLM response');
                parsed = JSON.parse(content);
                this.logger.log(
                    'Final summary LLM call completed successfully',
                );
                break;
            } catch (error) {
                if (
                    error instanceof SyntaxError &&
                    error.message.includes('Unexpected end of JSON input')
                ) {
                    retries++;
                    if (retries < maxRetries) {
                        this.logger.warn(
                            `JSON parse failed, retrying (${retries}/${maxRetries})`,
                        );
                        continue;
                    }
                }
                this.logger.error('Error in generateFinalSummary:', error);
                throw error;
            }
        }
        return parsed.finalSummary;
    }
    async getHistory(position: string, year: string) {
        return this.prisma.historyData.findMany({
            where: { position, year },
            orderBy: { createdAt: 'desc' },
        });
    }

    async deleteHistory(id: string, position: string, year: string) {
        return this.prisma.historyData.delete({
            where: { id, year, position },
        });
    }
}
