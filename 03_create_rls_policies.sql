-- RLS Policies for sessions table

-- Allow all authenticated users to read sessions
CREATE POLICY "Allow authenticated read access to all sessions" ON public.sessions
FOR SELECT USING (auth.role() = 'authenticated');

-- Allow public (anonymous) read access to sessions for the landing page
CREATE POLICY "Allow public read access to sessions" ON public.sessions
FOR SELECT USING (true); -- 'true' means always allow

-- Allow authenticated users to insert new sessions (if needed, consider more restrictive for production)
CREATE POLICY "Allow authenticated insert access for sessions" ON public.sessions
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- RLS Policies for messages table

-- Allow authenticated users to read messages in sessions they are part of
CREATE POLICY "Allow authenticated users to read messages" ON public.messages
FOR SELECT USING (
    auth.role() = 'authenticated' AND EXISTS (
        SELECT 1 FROM public.participants
        WHERE participants.session_id = messages.session_id
        AND participants.user_id = auth.uid()
    )
);

-- Allow authenticated users to insert their own messages
CREATE POLICY "Allow authenticated users to send messages" ON public.messages
FOR INSERT WITH CHECK (auth.uid() = messages.user_id);

-- Allow authenticated users to update their own messages
CREATE POLICY "Allow authenticated users to update own messages" ON public.messages
FOR UPDATE USING (auth.uid() = messages.user_id);

-- Allow authenticated users to delete their own messages
CREATE POLICY "Allow authenticated users to delete own messages" ON public.messages
FOR DELETE USING (auth.uid() = messages.user_id);

-- RLS Policies for participants table

-- Allow authenticated users to read participants in sessions they are part of
CREATE POLICY "Allow authenticated users to read participants" ON public.participants
FOR SELECT USING (
    auth.role() = 'authenticated' AND EXISTS (
        SELECT 1 FROM public.participants AS p_check
        WHERE p_check.session_id = participants.session_id
        AND p_check.user_id = auth.uid()
    )
);

-- Allow authenticated users to insert themselves as participants
CREATE POLICY "Allow authenticated users to join sessions" ON public.participants
FOR INSERT WITH CHECK (auth.uid() = participants.user_id);

-- Allow authenticated users to remove themselves from sessions
CREATE POLICY "Allow authenticated users to leave sessions" ON public.participants
FOR DELETE USING (auth.uid() = participants.user_id); 