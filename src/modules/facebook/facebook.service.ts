import { Injectable, Logger } from '@nestjs/common';
import { ApifyClient } from 'apify-client';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignPhase } from '@prisma/client';
import { OnEvent } from '@nestjs/event-emitter';
import { CampaignService } from '../campaign/campaign.service';

@Injectable()
export class FacebookService {
    private readonly logger = new Logger(FacebookService.name);
    private readonly apifyClient: ApifyClient;

    constructor(
        private readonly prisma: PrismaService,
        private readonly campaignService: CampaignService,
    ) {
        this.apifyClient = new ApifyClient({
            token: process.env.APIFY_KEY,
        });
    }

    @OnEvent('campaign.phaseChanged')
    async handlePhaseChange(payload: {
        campaignId: string;
        completedPhase: CampaignPhase;
    }) {
        this.logger.log(
            `Phase changed for campaign ${payload.campaignId} to ${payload.completedPhase}`,
        );
        await this.scrapeFacebookData(
            payload.campaignId,
            payload.completedPhase,
        );

        await this.campaignService.triggerPhaseAnalysis(
            payload.campaignId,
            payload.completedPhase,
        );
    }

    async getPostsAndComments(campaignId: string, phase: CampaignPhase) {
        console.log(
            `Fetching posts and comments for campaign ${campaignId} phase ${phase}`,
        );
        return this.prisma.facebookPost.findMany({
            where: {
                campaignId,
                phase,
            },
            include: {
                facebookComments: true,
            },
        });
    }

    async scrapeFacebookData(campaignId: string, phase: CampaignPhase) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId },
            select: { fbUrl: true },
        });

        if (!campaign?.fbUrl) {
            this.logger.warn(
                `No Facebook URL found for campaign ${campaignId}`,
            );
            return;
        }

        try {
            // Scrape posts
            const postsInput = {
                resultsLimit: 38, // Based on cost calculatio
                captionText: true,
                onlyPostsNewerThan: '30 days',
                startUrls: [{ url: campaign.fbUrl, method: 'GET' }],
            };

            const postRun = await this.apifyClient
                .actor('apify/facebook-posts-scraper')
                .call(postsInput);
            const postsDataset = await this.apifyClient
                .dataset(postRun.defaultDatasetId)
                .listItems();
            const totalComments = postsDataset.items.reduce((sum, post) => {
                return sum + ((post.comments as number) || 0);
            }, 0);
            this.logger.log(
                `Total dataset count: ${postsDataset.count}, items: ${postsDataset.items.length}, total:${postsDataset.total}`,
            );
            this.logger.log(
                `Scraped ${postsDataset.items.length} posts with a total of ${totalComments} comments for campaign ${campaignId}`,
            );
            for (const post of postsDataset.items) {
                this.logger.log(`Saving post: ${post.url}`);
                // Save post to database
                const savedPost = await this.prisma.facebookPost.upsert({
                    where: {
                        campaignId_phase_url: {
                            campaignId,
                            phase,
                            url: post.url as string,
                        },
                    },
                    update: {
                        campaignId,
                        phase,
                        content: post.text as string,
                        url: post.url as string,
                        timestamp: new Date((post.timestamp as number) * 1000),
                        likes: (post.likes as number) || 0,
                        shares: (post.shares as number) || 0,
                        commentsCount: (post.comments as number) || 0,
                    },
                    create: {
                        campaignId,
                        phase,
                        content: post.text as string,
                        url: post.url as string,
                        timestamp: new Date((post.timestamp as number) * 1000),
                        likes: (post.likes as number) || 0,
                        shares: (post.shares as number) || 0,
                        commentsCount: (post.comments as number) || 0,
                    },
                });

                try {
                    this.logger.log(`Scraping comments for post: ${post.url}`);
                    // Scrape comments for this post
                    const commentsInput = {
                        startUrls: [{ url: post.url, method: 'GET' }],
                        resultsLimit: 50, // Up to 50 comments per post
                    };

                    const commentRun = await this.apifyClient
                        .actor('apify/facebook-comments-scraper')
                        .call(commentsInput);
                    const commentsDataset = await this.apifyClient
                        .dataset(commentRun.defaultDatasetId)
                        .listItems();

                    for (const comment of commentsDataset.items) {
                        await this.prisma.facebookComment.upsert({
                            where: {
                                postId_phase_url: {
                                    postId: savedPost.id,
                                    phase,
                                    url: comment.commentUrl as string,
                                },
                            },
                            update: {
                                content: comment.text as string,
                                authorName: comment.profileName as string,
                                timestamp: new Date(comment.date as string),
                                likes:
                                    parseInt(comment.likesCount as string) || 0,
                                replies: (comment.commentsCount as number) || 0,
                            },
                            create: {
                                postId: savedPost.id,
                                phase,
                                content: comment.text as string,
                                authorName: comment.profileName as string,
                                timestamp: new Date(comment.date as string),
                                url: comment.commentUrl as string,
                                likes:
                                    parseInt(comment.likesCount as string) || 0,
                                replies: (comment.commentsCount as number) || 0,
                            },
                        });
                    }
                } catch (commentError) {
                    this.logger.error(
                        `Error scraping comments for post ${post.url}:`,
                        commentError,
                    );
                }
            }

            this.logger.log(
                `Scraped Facebook data for campaign ${campaignId} phase ${phase}`,
            );
        } catch (error) {
            this.logger.error(
                `Error scraping Facebook data for campaign ${campaignId}:`,
                error,
            );
        }
    }
}
