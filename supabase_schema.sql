-- Create usage_history table
CREATE TABLE IF NOT EXISTS public.usage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    store_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    items JSONB DEFAULT '{"list": [], "isImpulse": false, "impulseReasons": []}'::jsonb,
    used_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.usage_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to prevent "already exists" errors
DROP POLICY IF EXISTS "Users can view their own usage history" ON public.usage_history;
DROP POLICY IF EXISTS "Users can insert their own usage history" ON public.usage_history;
DROP POLICY IF EXISTS "Users can update their own usage history" ON public.usage_history;
DROP POLICY IF EXISTS "Users can delete their own usage history" ON public.usage_history;

-- Policy: Select policy (Only user's own data)
CREATE POLICY "Users can view their own usage history" 
ON public.usage_history 
FOR SELECT 
USING (auth.uid() = user_id);

-- Policy: Insert policy (Only user's own data)
CREATE POLICY "Users can insert their own usage history" 
ON public.usage_history 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Policy: Update policy (Only user's own data)
CREATE POLICY "Users can update their own usage history" 
ON public.usage_history 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Delete policy (Only user's own data)
CREATE POLICY "Users can delete their own usage history" 
ON public.usage_history 
FOR DELETE 
USING (auth.uid() = user_id);


-- Create wish_list table (NEW)
CREATE TABLE IF NOT EXISTS public.wish_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    current_savings INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS) for wish_list
ALTER TABLE public.wish_list ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to prevent "already exists" errors
DROP POLICY IF EXISTS "Users can view their own wish list" ON public.wish_list;
DROP POLICY IF EXISTS "Users can insert their own wish list" ON public.wish_list;
DROP POLICY IF EXISTS "Users can update their own wish list" ON public.wish_list;
DROP POLICY IF EXISTS "Users can delete their own wish list" ON public.wish_list;

-- Policies for wish_list
CREATE POLICY "Users can view their own wish list" 
ON public.wish_list 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wish list" 
ON public.wish_list 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wish list" 
ON public.wish_list 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wish list" 
ON public.wish_list 
FOR DELETE 
USING (auth.uid() = user_id);


-- Create user_settings table (NEW)
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    monthly_base_savings INTEGER DEFAULT 5000,
    monthly_income BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS) for user_settings
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to prevent "already exists" errors
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;

-- Policies for user_settings
CREATE POLICY "Users can view their own settings" 
ON public.user_settings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings" 
ON public.user_settings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" 
ON public.user_settings 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Migration for existing environments
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS monthly_income bigint;

-- Create streaks table (NEW)
CREATE TABLE IF NOT EXISTS public.streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    current_streak INTEGER DEFAULT 0 NOT NULL,
    best_streak INTEGER DEFAULT 0 NOT NULL,
    last_convini_date DATE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable Row Level Security (RLS) for streaks
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists to avoid errors
DROP POLICY IF EXISTS "Users can manage own streaks" ON public.streaks;

-- Policy for streaks
CREATE POLICY "Users can manage own streaks" 
ON public.streaks 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

