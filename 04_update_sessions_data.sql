-- SQL script to insert or update sessions with accurate details

INSERT INTO public.sessions (id, category, created_at, description)
VALUES
    ('3c0baaf2-45d5-4986-8a56-e205ad9e1c4f', 'Motivated', '2025-06-12T17:33:55.574268+00:00', 'Ready to take on challenges'),
    ('9dcaa32f-b371-4ebf-9153-8747a16e19b2', 'Hopeful', '2025-06-12T17:33:55.574268+00:00', 'Looking forward with optimism'),
    ('ad209c8b-dde1-44e7-8642-7da4e1f8cfe3', 'Lonely', '2025-06-12T17:33:55.574268+00:00', 'Seeking connection and understanding'),
    ('cd90792e-bb54-4a5b-b1b9-59fb27fbc49f', 'Joyful', '2025-06-12T17:33:55.574268+00:00', 'Filled with happiness and gratitude'),
    ('647161c4-0bfc-4142-9f7a-fc6eefb17325', 'Calm', '2025-06-12T17:33:55.574268+00:00', 'Finding peace in the moment'),
    ('5b169685-1790-493e-a569-3aeec7b60b33', 'Loving', '2025-06-12T17:33:55.574268+00:00', 'Embracing warmth and compassion'),
    ('60df81b2-2d61-47fa-8988-9165d3b3f793', 'Books', '2025-06-08T14:26:03.683316+00:00', NULL)
ON CONFLICT (id) DO UPDATE SET
    category = EXCLUDED.category,
    created_at = EXCLUDED.created_at,
    description = EXCLUDED.description;

-- After running this script in Supabase SQL Editor, verify the changes in the 'sessions' table. 