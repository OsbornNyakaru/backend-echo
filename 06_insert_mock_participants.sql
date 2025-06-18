-- SQL script to insert or update mock participants data

INSERT INTO public.participants (user_id, session_id, user_name, avatar, mood, is_speaking, is_muted, joined_at)
VALUES
    -- Mock Participants for 'Joyful' session
    ('01e9d8f3-a1b2-4c3d-8e7f-6a5b4c3d2e1f', 'cd90792e-bb54-4a5b-b1b9-59fb27fbc49f', 'HappyUser', '/avatars/happy.png', 'joyful', FALSE, FALSE, '2025-06-13T10:00:00Z'),
    ('10a9c8b7-d6e5-4f3a-2b1c-0e9d8c7b6a5f', 'cd90792e-bb54-4a5b-b1b9-59fb27fbc49f', 'GleeSeeker', '/avatars/glee.png', 'joyful', TRUE, FALSE, '2025-06-13T10:05:00Z'),

    -- Mock Participants for 'Motivated' session
    ('23f4e5d6-c7b8-9a0b-1c2d-3e4f5a6b7c8d', '3c0baaf2-45d5-4986-8a56-e205ad9e1c4f', 'DrivenDev', '/avatars/driven.png', 'motivated', FALSE, FALSE, '2025-06-13T10:10:00Z'),
    ('34d5e6f7-b8c9-0a1b-2c3d-4e5f6a7b8c9d', '3c0baaf2-45d5-4986-8a56-e205ad9e1c4f', 'GoalGetter', '/avatars/goal.png', 'motivated', FALSE, TRUE, '2025-06-13T10:15:00Z'),

    -- Mock Participants for 'Lonely' session
    ('45e6f7a8-c9d0-1b2c-3d4e-5f6a7b8c9d0e', 'ad209c8b-dde1-44e7-8642-7da4e1f8cfe3', 'SeekingFriend', '/avatars/lonely.png', 'lonely', FALSE, FALSE, '2025-06-13T10:20:00Z'),

    -- Mock Participants for 'Calm' session
    ('56f7a8b9-d0e1-2c3d-4e5f-6a7b8c9d0e1f', '647161c4-0bfc-4142-9f7a-fc6eefb17325', 'PeacefulPanda', '/avatars/calm.png', 'calm', FALSE, FALSE, '2025-06-13T10:25:00Z');

-- After running this script in Supabase SQL Editor, verify the data in the 'participants' table. 