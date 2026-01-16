import { supabase } from './supabase';

export interface Poll {
    id: string;
    created_at: string;
    user_id?: string;
    situation_summary: string;
    context?: any;
    poll_type: string;
    status: string;
    total_votes: number;
}

export interface CreatePollParams {
    situationSummary: string;
    context?: {
        productName?: string;
        senderName?: string;
        estimatedPrice?: number;
        occasion?: string;
    };
}

export class PollService {
    /**
     * Create a new poll from analysis result
     */
    static async createPoll(params: CreatePollParams): Promise<Poll | null> {
        try {
            const { data, error } = await supabase
                .from('polls')
                .insert({
                    situation_summary: params.situationSummary,
                    context: params.context || null,
                    poll_type: 'gift_amount',
                    status: 'active',
                    total_votes: 0,
                })
                .select()
                .single();

            if (error) {
                console.error('Error creating poll:', error);
                return null;
            }

            return data as Poll;
        } catch (error) {
            console.error('Exception creating poll:', error);
            return null;
        }
    }

    /**
     * Fetch all active community polls
     */
    static async getActivePolls(): Promise<Poll[]> {
        try {
            const { data, error } = await supabase
                .from('polls')
                .select('*')
                .eq('status', 'active')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching polls:', error);
                return [];
            }

            return data as Poll[];
        } catch (error) {
            console.error('Exception fetching polls:', error);
            return [];
        }
    }

    /**
     * Get a specific poll by ID
     */
    static async getPollById(id: string): Promise<Poll | null> {
        try {
            const { data, error } = await supabase
                .from('polls')
                .select('*')
                .eq('id', id)
                .single();

            if (error) {
                console.error('Error fetching poll:', error);
                return null;
            }

            return data as Poll;
        } catch (error) {
            console.error('Exception fetching poll:', error);
            return null;
        }
    }

    /**
     * Update poll total votes count
     */
    static async updatePollVoteCount(pollId: string, increment: number = 1): Promise<void> {
        try {
            // Get current count
            const { data: poll } = await supabase
                .from('polls')
                .select('total_votes')
                .eq('id', pollId)
                .single();

            if (poll) {
                await supabase
                    .from('polls')
                    .update({ total_votes: (poll.total_votes || 0) + increment })
                    .eq('id', pollId);
            }
        } catch (error) {
            console.error('Error updating poll vote count:', error);
        }
    }

    /**
     * Close a poll (future feature for poll ownership)
     */
    static async closePoll(id: string): Promise<boolean> {
        try {
            const { error } = await supabase
                .from('polls')
                .update({ status: 'closed' })
                .eq('id', id);

            if (error) {
                console.error('Error closing poll:', error);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Exception closing poll:', error);
            return false;
        }
    }

    /**
     * ✅ 투표 삭제 (votes도 CASCADE로 자동 삭제됨)
     */
    static async deletePoll(id: string): Promise<boolean> {
        try {
            const { error } = await supabase
                .from('polls')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('Error deleting poll:', error);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Exception deleting poll:', error);
            return false;
        }
    }
}
