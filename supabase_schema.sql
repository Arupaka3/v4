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
