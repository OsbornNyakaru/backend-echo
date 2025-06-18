-- Create the sessions table
CREATE TABLE public.sessions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    category text NOT NULL DEFAULT ''::text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    description text NULL,
    CONSTRAINT sessions_pkey PRIMARY KEY (id)
);

-- Create the messages table
CREATE TABLE public.messages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL,
    sender text NOT NULL DEFAULT ''::text,
    text text NOT NULL DEFAULT ''::text,
    "timestamp" timestamp with time zone NOT NULL DEFAULT now(),
    user_id uuid NOT NULL, -- Changed to UUID type
    "userName" text NOT NULL DEFAULT ''::text,
    avatar text NULL DEFAULT '/avatars/default-avatar.png'::text,
    content text NOT NULL DEFAULT ''::text,
    type text NOT NULL DEFAULT 'text'::text,
    reactions jsonb NULL DEFAULT '[]'::jsonb,
    is_edited boolean NOT NULL DEFAULT false,
    reply_to uuid NULL,
    CONSTRAINT messages_pkey PRIMARY KEY (id),
    CONSTRAINT messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE,
    CONSTRAINT messages_reply_to_fkey FOREIGN KEY (reply_to) REFERENCES public.messages(id) ON DELETE SET NULL
);

-- Create the participants table
CREATE TABLE public.participants (
    user_id uuid NOT NULL, -- Changed to UUID type
    session_id uuid NOT NULL,
    user_name text NOT NULL DEFAULT ''::text,
    avatar text NULL DEFAULT '/avatars/default-avatar.png'::text,
    mood text NULL DEFAULT 'calm'::text,
    is_speaking boolean NOT NULL DEFAULT false,
    is_muted boolean NOT NULL DEFAULT false,
    joined_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT participants_pkey PRIMARY KEY (user_id, session_id),
    CONSTRAINT participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE
); 