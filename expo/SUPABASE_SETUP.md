# Supabase Setup Instructions

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new account
2. Create a new project
3. Wait for the project to be set up

## 2. Get API Keys

1. Go to your project dashboard
2. Navigate to Settings > API
3. Copy the following values:
   - Project URL
   - Anon/Public Key

## 3. Update Environment Variables

Update your `.env` file with the Supabase credentials:

```env
EXPO_PUBLIC_SUPABASE_URL=your_project_url_here
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

## 4. Create Database Tables

Run the following SQL in your Supabase SQL Editor:

```sql
-- Create profiles table with all required fields
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  phone TEXT,
  role TEXT CHECK (role IN ('customer', 'driver', 'company')),
  avatar TEXT,
  account_status TEXT CHECK (account_status IN ('active', 'inactive', 'suspended')) DEFAULT 'active',
  verification_status TEXT CHECK (verification_status IN ('pending', 'verified', 'rejected', 'under_review', 'requires_documents')) DEFAULT 'pending',
  registration_completed_at TIMESTAMP WITH TIME ZONE,
  verified_at TIMESTAMP WITH TIME ZONE,
  company_id UUID,
  driver_verification_status TEXT CHECK (driver_verification_status IN ('pending', 'verified', 'rejected', 'under_review')),
  company_verification_status TEXT CHECK (company_verification_status IN ('pending', 'verified', 'rejected', 'under_review')),
  documents_submitted BOOLEAN DEFAULT FALSE,
  documents_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (id)
);

-- Set up Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create function to handle user creation (optional - profiles are created when role is set)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $
BEGIN
  -- Don't automatically create profile - let the app handle it after role selection
  -- This prevents issues with role selection flow
  RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation (optional)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
```

## 4b. Profile Pictures & Public Profiles

These two features need (a) a Storage bucket for avatars and (b) read
policies that let drivers view *each other's* public profile + rank.

### Avatar storage bucket

Run in the SQL Editor (or create the bucket from the Storage UI):

```sql
-- Public bucket that holds user profile pictures
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view avatars (public read)
CREATE POLICY "Avatar images are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- A user may upload/replace only files inside their own folder (userId/...)
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

### Let drivers view each other's profile + rank

By default the `profiles` policy only allows viewing your *own* row. Add a
public-read policy so the "see other people's profile" screen works, and
allow reading other users' level from `user_xp`:

```sql
-- Public profiles can be viewed by any signed-in user
CREATE POLICY "Public profiles are viewable"
  ON profiles FOR SELECT
  USING (true);

-- Levels/ranks are viewable by any signed-in user
CREATE POLICY "Public XP is viewable"
  ON user_xp FOR SELECT
  USING (true);
```

> If you already created a stricter `"Users can view own profile"` policy,
> keep it — Postgres combines SELECT policies with OR, so the public policy
> simply widens read access. Writes stay locked to the owner.

## 5. Test the Authentication

1. Start your app: `npm start` or `yarn start`
2. Try creating a new account using the signup page
3. Check your Supabase dashboard to see if the user was created
4. Try logging in with the created account

## Features Included

- ✅ User registration with email/password
- ✅ User login with email/password
- ✅ User profile management
- ✅ Role selection (customer/driver/company)
- ✅ Automatic session management
- ✅ Secure authentication with Supabase
- ✅ Real-time auth state updates
- ✅ Profile picture upload (camera / library → Supabase Storage)
- ✅ Viewing other drivers' public profiles with their rank shown large

## Next Steps

After setting up Supabase, you can:
1. Add password reset functionality
2. Add social login (Google, Apple, etc.)
3. Add email verification
4. Create additional tables for towing requests, drivers, etc.
5. Add real-time subscriptions for live updates

## Feature Migrations

Run these additional SQL migrations in the Supabase SQL Editor to enable
their features (each is idempotent and safe to re-run):

- `database_migration_saved_routes.sql` — Strava-style route sharing
- `database_migration_events_realtime.sql` — live drive events
- `database_migration_daily_quests.sql` — **Daily Quest System** (procedural,
  rule-based quest engine with XP/coins/badges; see `DAILY_QUEST_SYSTEM.md`)