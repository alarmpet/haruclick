import { supabase } from './supabase';
import { PollService } from './PollService';

export interface Vote {
    id: string;
    created_at: string;
    poll_id: string;
    voter_id?: string;
    selected_amount: number;
}

export interface VoteResults {
    amounts: {
        amount: number;
        count: number;
        percentage: number;
    }[];
    totalVotes: number;
}

export class VoteService {
    // Standard voting amounts
    static readonly VOTE_AMOUNTS = [50000, 100000, 150000, 200000];

    /**
     * Submit a vote for a poll
     */
    static async submitVote(pollId: string, amount: number): Promise<boolean> {
        try {
            // Validate amount
            if (!this.VOTE_AMOUNTS.includes(amount)) {
                console.error('Invalid vote amount:', amount);
                return false;
            }

            const { error } = await supabase
                .from('votes')
                .insert({
                    poll_id: pollId,
                    selected_amount: amount,
                });

            if (error) {
                console.error('Error submitting vote:', error);
                return false;
            }

            // Update poll total votes count
            await PollService.updatePollVoteCount(pollId, 1);

            return true;
        } catch (error) {
            console.error('Exception submitting vote:', error);
            return false;
        }
    }

    /**
     * Get aggregated vote results for a poll
     */
    static async getVoteResults(pollId: string): Promise<VoteResults> {
        try {
            const { data, error } = await supabase
                .from('votes')
                .select('selected_amount')
                .eq('poll_id', pollId);

            if (error) {
                console.error('Error fetching votes:', error);
                return this.getEmptyResults();
            }

            const votes = data as Vote[];
            const totalVotes = votes.length;

            // Count votes for each amount
            const amountCounts: { [key: number]: number } = {};
            this.VOTE_AMOUNTS.forEach(amount => {
                amountCounts[amount] = 0;
            });

            votes.forEach(vote => {
                if (amountCounts[vote.selected_amount] !== undefined) {
                    amountCounts[vote.selected_amount]++;
                }
            });

            // Calculate percentages
            const amounts = this.VOTE_AMOUNTS.map(amount => ({
                amount,
                count: amountCounts[amount],
                percentage: totalVotes > 0 ? (amountCounts[amount] / totalVotes) * 100 : 0,
            }));

            return {
                amounts,
                totalVotes,
            };
        } catch (error) {
            console.error('Exception fetching vote results:', error);
            return this.getEmptyResults();
        }
    }

    /**
     * Check if user has already voted on a poll (for future auth implementation)
     */
    static async hasUserVoted(pollId: string, userId?: string): Promise<boolean> {
        if (!userId) return false; // Anonymous mode, allow multiple votes

        try {
            const { data, error } = await supabase
                .from('votes')
                .select('id')
                .eq('poll_id', pollId)
                .eq('voter_id', userId)
                .limit(1);

            if (error) {
                console.error('Error checking user vote:', error);
                return false;
            }

            return data && data.length > 0;
        } catch (error) {
            console.error('Exception checking user vote:', error);
            return false;
        }
    }

    /**
     * Get empty results structure
     */
    private static getEmptyResults(): VoteResults {
        return {
            amounts: this.VOTE_AMOUNTS.map(amount => ({
                amount,
                count: 0,
                percentage: 0,
            })),
            totalVotes: 0,
        };
    }
}
