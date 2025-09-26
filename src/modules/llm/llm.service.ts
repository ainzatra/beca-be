import { Injectable, Logger } from '@nestjs/common';
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

    //     async countVotes(year: number, voteFiles: any[], precinctFile: any) {
    //         this.logger.log(`Starting vote counting for year ${year}`);

    //         const voteTexts: string[] = [];
    //         let precinctText: string;

    //         // Parse vote files
    //         for (let i = 0; i < voteFiles.length; i++) {
    //             try {
    //                 const dataBuffer = voteFiles[i].buffer;
    //                 const data = await pdfParse(dataBuffer);
    //                 voteTexts.push(data.text);
    //                 this.logger.log(
    //                     `Parsed vote file ${i + 1}: ${data.text.length} characters`,
    //                 );
    //             } catch (error) {
    //                 this.logger.error(`Failed to parse vote file ${i + 1}:`, error);
    //                 throw error;
    //             }
    //         }

    //         // Parse precinct file
    //         try {
    //             const precinctBuffer = precinctFile.buffer;
    //             const precinctData = await pdfParse(precinctBuffer);
    //             precinctText = precinctData.text;
    //             this.logger.log(
    //                 `Parsed precinct file: ${precinctText.length} characters`,
    //             );
    //         } catch (error) {
    //             this.logger.error('Failed to parse precinct file:', error);
    //             throw error;
    //         }

    // //         // LLM parsing
    // //         const systemPrompt = `You are an expert at parsing election vote data from scanned PDF text. Your output must be a valid JSON object with a key "data" containing an array of vote records. Each record should be an object with: "location" (string, e.g., "Quezon City, Barangay X" - map using precinct info), "position" (string, e.g., "Mayor"), "candidate" (string, full name), "votes" (number). Only include valid, complete data. If no data, return empty array.`;

    // //         const parsedData: any[][] = [];

    // //         for (let i = 0; i < voteTexts.length; i++) {
    // //             const voteText = voteTexts[i];
    // //             const userPrompt = `Precinct mapping information:
    // // ${precinctText}

    // // Vote data from file ${i + 1}:
    // // ${voteText}

    // // Instructions:
    // // - Identify precinct clusters and individual precinct numbers in the vote data.
    // // - For each precinct, use the mapping to find the corresponding location (city, barangay, etc.).
    // // - Extract candidates, their positions (e.g., Mayor, Vice Mayor, Councilor), and vote counts.
    // // - Group votes by location, position, and candidate. If multiple precincts in same location, sum votes.
    // // - Ourput strictly in JSON values should be in ALL CAPS.`;

    // //             try {
    // //                 this.logger.log('Starting to prompt AI...');
    // //                 // console.log(userPrompt);
    // //                 // const completion = (await this.openai.chat.completions.create({
    // //                 //     model: 'x-ai/grok-4-fast:free',
    // //                 //     messages: [
    // //                 //         { role: 'system', content: systemPrompt },
    // //                 //         { role: 'user', content: userPrompt },
    // //                 //     ],
    // //                 //     response_format: { type: 'json_object' },
    // //                 //     temperature: 0.1,
    // //                 //     stream: true,
    // //                 // })) as any;

    // //                 const response = await fetch(
    // //                     'https://openrouter.ai/api/v1/chat/completions',
    // //                     {
    // //                         method: 'POST',
    // //                         headers: {
    // //                             Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    // //                             'Content-Type': 'application/json',
    // //                         },
    // //                         body: JSON.stringify({
    // //                             model: 'google/gemini-2.5-flash-lite',
    // //                             messages: [
    // //                                 { role: 'system', content: systemPrompt },
    // //                                 { role: 'user', content: userPrompt },
    // //                             ],
    // //                             stream: true,
    // //                         }),
    // //                     },
    // //                 );

    // //                 const reader = response.body?.getReader();
    // //                 if (!reader) {
    // //                     throw new Error();
    // //                 }

    // //                 const decoder = new TextDecoder();
    // //                 let buffer = '';
    // //                 let results = '';
    // //                 try {
    // //                     while (true) {
    // //                         const { done, value } = await reader.read();
    // //                         if (done) break;
    // //                         // Append new chunk to buffer
    // //                         buffer += decoder.decode(value, { stream: true });
    // //                         // Process complete lines from buffer
    // //                         while (true) {
    // //                             const lineEnd = buffer.indexOf('\n');
    // //                             if (lineEnd === -1) break;
    // //                             const line = buffer.slice(0, lineEnd).trim();
    // //                             buffer = buffer.slice(lineEnd + 1);
    // //                             if (line.startsWith('data: ')) {
    // //                                 const data = line.slice(6);
    // //                                 if (data === '[DONE]') break;
    // //                                 try {
    // //                                     const parsed = JSON.parse(data);
    // //                                     const content =
    // //                                         parsed.choices[0].delta.content;
    // //                                     if (content) {
    // //                                         // console.log('content:', content);
    // //                                         results += content;
    // //                                     }
    // //                                 } catch (e) {
    // //                                     // Ignore invalid JSON
    // //                                 }
    // //                             }
    // //                         }
    // //                     }
    // //                 } finally {
    // //                     reader.cancel();
    // //                 }

    // //                 console.log(results);

    // //                 // if (!jsonStr) {
    // //                 //     throw new Error(`No response from LLM for file ${i + 1}`);
    // //                 // }

    // //                 // const jsonResponse = JSON.parse(jsonStr);
    // //                 // const fileData = jsonResponse.data || [];
    // //                 // parsedData.push(fileData);
    // //                 // this.logger.log(
    // //                 //     `Parsed vote data for file ${i + 1}: ${fileData.length} records`,
    // //                 // );
    // //                 // this.logger.log(
    // //                 //     `Tokens used for file ${i + 1}: prompt: ${completion.usage?.prompt_tokens || 0}, completion: ${completion.usage?.completion_tokens || 0}, total: ${completion.usage?.total_tokens || 0}`,
    // //                 // );
    // //             } catch (error) {
    // //                 this.logger.error(
    // //                     `Failed to parse vote file ${i + 1} with LLM:`,
    // //                     error,
    // //                 );
    // //                 parsedData.push([]); // Empty for this file
    // //             }
    // //         }

    // //         // Save to database
    // //         const savedIds: string[] = [];

    // //         for (let i = 0; i < parsedData.length; i++) {
    // //             const fileData = parsedData[i];
    // //             const jsonData = {
    // //                 year: year,
    // //                 data: fileData,
    // //             };
    // //             try {
    // //                 const historyData = await this.prisma.historyData.create({
    // //                     data: {
    // //                         json: jsonData,
    // //                     },
    // //                 });
    // //                 savedIds.push(historyData.id);
    // //                 this.logger.log(
    // //                     `Saved vote data for file ${i + 1} to HistoryData ID: ${historyData.id}`,
    // //                 );
    // //             } catch (error) {
    // //                 this.logger.error(
    // //                     `Failed to save vote data for file ${i + 1} to database:`,
    // //                     error,
    // //                 );
    // //                 // Continue with next file
    // //             }
    // //         }

    // //         return { savedIds };
    //     }

    async countVotes(year: number, voteFiles: any[], precinctFile: any) {
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
        console.log(
            'Prased barangay: ',
            JSON.stringify(parsedBarangay, null, 2),
        );

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
                console.log('vote text without cluster', voteText);
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
                console.log(cluster);
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
            console.log(
                'Sample aggregated votes:',
                Object.fromEntries(totalVotesByCandidate),
            );

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
            voteResults.push({
                year,
                total_clusters: processedClusters.length,
                // clusters: processedClusters,
                votes: aggregated,
                // type: position,
                // Optionally include precinctText for further processing
            });
        }

        voteResults.forEach((result, index) => {
            console.log(
                `File ${index} Results:`,
                JSON.stringify(result, null, 2),
            );
        });
        return voteResults;
    }

    private parseBarangayPrecincts(
        precinctText: string,
    ): Array<{ barangay: string; precincts: string[] }> {
        const lines = precinctText.split('\n');
        const barangayPrecinctMap = new Map<string, Set<string>>();
        let currentBarangay: string | null = null;

        const skipLines = (line: string) => {
            const trimmed = line.trim();
            if (!trimmed) return true;
            if (
                trimmed.includes('Date:') ||
                trimmed.includes('Page') ||
                trimmed.includes('HASH:') ||
                trimmed.includes('SUBTOTAL') ||
                trimmed.includes('Election Officer') ||
                trimmed.match(/^\d+,\d+$/) || // Voter counts like 1980
                trimmed.includes('SCHOOL') ||
                trimmed.includes('CENTER')
            ) {
                // Voting center names
                return true;
            }
            // Skip headers
            if (
                [
                    'CITY / MUNICIPALITY',
                    'PROVINCE',
                    'Republic of the Philippines',
                    'COMMISSION ON ELECTIONS',
                    'P R O J E C T  O F  P R E C I N C T',
                    'MAY 12, 2025',
                    'BARANGAY',
                    'NAME AND ADDRESS',
                    'OF VOTING CENTER',
                    'TOTAL NO. OF',
                    'REGISTERED',
                    'VOTERS',
                    'CLUSTER/',
                    'GROUP',
                    'NUMBER',
                    'CLUSTERED/',
                    'GROUPED',
                    'PRECINCT',
                    'TOTAL NO.OF REG',
                    'VOTERS AFTER',
                    'CLUSTERING/',
                    'GROUPING',
                    'ESTABLISHED',
                ].some((kw) => line.includes(kw))
            ) {
                return true;
            }
            return false;
        };

        const precinctRegex = /\b(00\d+[A-B]?)\b/g; // Matches 0001A, etc.

        for (let idx = 0; idx < lines.length; idx++) {
            const line = lines[idx];
            if (skipLines(line)) {
                // When we hit SUBTOTAL, reset barangay
                if (line.includes('SUBTOTAL')) {
                    currentBarangay = null;
                }
                continue;
            }

            const trimmed = line.trim();
            // Detect barangay: Uppercase words, not numbers
            if (
                /^[A-Z][A-Z\s]+$/.test(trimmed) &&
                trimmed.length > 2 &&
                !/\d/.test(trimmed)
            ) {
                currentBarangay = trimmed;
                if (!barangayPrecinctMap.has(currentBarangay)) {
                    barangayPrecinctMap.set(currentBarangay, new Set());
                }
                continue;
            }

            // If we have current barangay, extract precincts from this and next few lines (clusters span lines)
            if (currentBarangay) {
                let match;
                precinctRegex.lastIndex = 0;
                while ((match = precinctRegex.exec(line)) !== null) {
                    const precinct = match[1];
                    barangayPrecinctMap.get(currentBarangay)!.add(precinct);
                }
                // Check next lines for continued cluster lists (they often span 2-3 lines)
                for (let j = 1; j <= 3 && idx + j < lines.length; j++) {
                    const nextLine = lines[idx + j];
                    if (skipLines(nextLine) || nextLine.trim().match(/^\d+$/))
                        break; // Stop at voter count or skip
                    precinctRegex.lastIndex = 0;
                    while ((match = precinctRegex.exec(nextLine)) !== null) {
                        const precinct = match[1];
                        barangayPrecinctMap.get(currentBarangay)!.add(precinct);
                    }
                }
            }
        }

        const result: Array<{ barangay: string; precincts: string[] }> = [];
        for (const [barangay, precinctSet] of barangayPrecinctMap) {
            result.push({
                barangay,
                precincts: Array.from(precinctSet).sort(),
            });
        }

        this.logger.log(
            `Parsed ${result.length} barangays with total ${result.reduce((sum, b) => sum + b.precincts.length, 0)} precincts`,
        );
        return result.sort((a, b) => a.barangay.localeCompare(b.barangay));
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
                    console.log(
                        `Possible barangay skipped: ${candidate} (line ${i})`,
                    ); // DEBUG
                    continue;
                }

                // Valid barangay found
                console.log(`Detected barangay: ${candidate} (line ${i})`); // DEBUG
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
                                console.log(
                                    `Invalid precinct skipped: ${potential} -> ${cleanPrecinct} (in ${currentBarangay})`,
                                ); // DEBUG: Catches "5831S"
                            }
                        });
                        if (addedCount > 0) {
                            console.log(
                                `Added ${addedCount} precincts to ${currentBarangay}: [${Array.from(precinctSet).slice(-addedCount).join(', ')}]`,
                            ); // DEBUG sample
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
        previousReports?: any,
    ) {
        const systemPrompt = `You are an expert AI analyst for election campaign surveys. Analyze the provided surveys and responses from the completed campaign phase. A phase can have multiple surveys with different topics/questions.

Important: Question IDs are random and not meaningful. Use the 'questionTitle' to identify question types and content. Analyze across all surveys, combining data for overall sentiments, issues, trends. For example:
- Voter likelihood: titles about "likely to vote".
- Issues: selections or text about priorities/concerns.
- Qualities/support/feedback: open text responses for sentiment.
- Sources: information sources.

Key Analysis:
- Sentiments: Classify each respondent's overall sentiment (positive/neutral/negative) towards the candidate/election, based on open responses across surveys. Do not aggregate totals; instead, provide the sentiment for each response ID.
- Group by location: Extract from 'address' field, normalize to city/barangay (e.g., "Manila", "Barangay 1"). For each location, group the sentiments by response ID.
- Top Issues: Identify 3-5 key issues from all surveys (selections and open text). For each: name, array of response IDs that mentioned the issue, majority sentiment (Positive/Negative/Neutral based on the sentiments of those respondents), trend (up/down/flat based on frequency/urgency compared to previous report if provided).
- Performance: Infer trends from voter likelihood, sources, qualities across surveys. Estimate overall confidence score (0-100) for campaign success.
- Summary: Concise 200-300 word narrative for non-technical readers, highlighting findings from all surveys and recommendations. If previous report is provided, compare trends and changes.

Input:
- Surveys: Array of {title, form: [{id, title: questionTitle, type, options, required}], responses: [{id: responseId, name, address: location, data: [{questionId, questionTitle, value}]}]}
- Campaign: "${campaignTitle}"
- Phase: "${completedPhase}"
- Previous Report: ${previousReports.length > 0 ? JSON.stringify(previousReports, null, 2) : 'None (first phase)'}

Output ONLY valid JSON, no other text. Structure matches frontend:

{
    "summary": "Narrative summary...",
    "confidence": number (0-100),
    "topIssues": [
        {
            "issue": "string",
            "responses": ["responseId1", "responseId2"],
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

        const userPrompt = `Campaign: ${campaignTitle}
Completed Phase: ${completedPhase}

${previousReports.length > 0 ? `Previous Report: ${JSON.stringify(previousReports, null, 2)}` : ''}

Phase Surveys Data: ${JSON.stringify(phaseData, null, 2)}`;

        try {
            console.log('Sending prompt to AI...');
            const completion = await this.openai.chat.completions.create({
                model: 'x-ai/grok-4-fast:free',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.3,
                max_tokens: 10000,
            });

            if (completion.usage) {
                // log tokens
                console.log('Prompt tokens:', completion.usage.prompt_tokens);
                console.log(
                    'Completion tokens:',
                    completion.usage.completion_tokens,
                );
                console.log('Total tokens:', completion.usage.total_tokens);
            }
            const content = completion.choices[0].message.content;
            if (!content) throw new Error('No content in LLM response');

            const parsed = JSON.parse(content);
            console.log('Counting mentions and sentiments by location...');
            const { topIssues, locationSentiment } = parsed;

            topIssues.forEach(
                (issue) => (issue.mentions = issue.responses?.length || 0),
            );

            // parsed.topIssues = topIssues;
            let totalResponses = 0;
            let positive = 0;
            let negative = 0;
            let neutral = 0;

            locationSentiment.forEach((loc) => {
                loc.positive = 0;
                loc.negative = 0;
                loc.neutral = 0;
                for (const response of loc.sentiments) {
                    totalResponses++;
                    switch (response.sentiment) {
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
                        default:
                            break;
                    }
                }
            });

            // parsed.locationSentiment = locationSentiment;

            const countedResponse = {
                ...parsed,
                topIssues,
                locationSentiment,
                totalResponses,
                positive,
                negative,
                neutral,
            };
            this.logger.log('Survey analysis completed successfully');
            return countedResponse;
        } catch (error) {
            this.logger.error('Error in analyzeSurveyResponses:', error);
            throw error;
        }
    }
}
