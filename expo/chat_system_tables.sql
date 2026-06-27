-- Chat System Database Tables for Supabase
-- Run these SQL commands in your Supabase SQL editor

-- 1. Create tow_requests table
CREATE TABLE IF NOT EXISTS tow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES auth.users(id) NOT NULL,
  driver_id UUID REFERENCES auth.users(id),
  company_id UUID REFERENCES companies(id),
  pickup_location JSONB NOT NULL,
  dropoff_location JSONB NOT NULL,
  vehicle_info JSONB NOT NULL,
  breakdown_info JSONB NOT NULL,
  service_type TEXT CHECK (service_type IN ('hydraulic', 'ladder', 'accident', 'service', 'double_deck')) DEFAULT 'ladder' NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending' NOT NULL,
  distance_km NUMERIC NOT NULL,
  price_idr NUMERIC NOT NULL,
  payment_status TEXT CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')) DEFAULT 'pending' NOT NULL,
  payment_transaction_id UUID,
  driver_location JSONB,
  estimated_arrival TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 2. Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tow_request_id TEXT NOT NULL,
  sender_id UUID REFERENCES auth.users(id) NOT NULL,
  receiver_id UUID REFERENCES auth.users(id) NOT NULL,
  message_type TEXT CHECK (message_type IN ('text', 'location', 'system', 'image', 'status_update')) DEFAULT 'text' NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN DEFAULT false NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tow_requests_customer_id ON tow_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_tow_requests_driver_id ON tow_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_tow_requests_company_id ON tow_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_tow_requests_status ON tow_requests(status);
CREATE INDEX IF NOT EXISTS idx_tow_requests_payment_status ON tow_requests(payment_status);
CREATE INDEX IF NOT EXISTS idx_tow_requests_created_at ON tow_requests(created_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_tow_request_id ON chat_messages(tow_request_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver_id ON chat_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_is_read ON chat_messages(is_read);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE tow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies for tow_requests
CREATE POLICY "Customers can view their own requests" ON tow_requests
  FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Drivers can view requests assigned to them" ON tow_requests
  FOR SELECT USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can view pending requests for assignment" ON tow_requests
  FOR SELECT USING (status = 'pending' AND driver_id IS NULL);

CREATE POLICY "Customers can create requests" ON tow_requests
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can update their own pending requests" ON tow_requests
  FOR UPDATE USING (auth.uid() = customer_id AND status = 'pending');

CREATE POLICY "Drivers can accept pending requests" ON tow_requests
  FOR UPDATE USING (status = 'pending' AND auth.uid() = driver_id)
  WITH CHECK (status = 'accepted');

CREATE POLICY "Drivers can update status of their assigned requests" ON tow_requests
  FOR UPDATE USING (auth.uid() = driver_id AND driver_id IS NOT NULL);

-- 6. Create RLS policies for chat_messages
CREATE POLICY "Users can view messages they sent or received" ON chat_messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can insert messages they are sending" ON chat_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update read status of messages they received" ON chat_messages
  FOR UPDATE USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- 7. Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 8. Create triggers for updated_at
CREATE TRIGGER update_tow_requests_updated_at BEFORE UPDATE ON tow_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_messages_updated_at BEFORE UPDATE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. Create function to send system messages when request status changes
CREATE OR REPLACE FUNCTION send_system_message_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  message_content TEXT;
  receiver_user_id UUID;
BEGIN
  -- Only send message if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'accepted' THEN
        message_content := 'Driver telah menerima permintaan Anda dan sedang menuju lokasi penjemputan.';
        receiver_user_id := NEW.customer_id;
      WHEN 'in_progress' THEN
        message_content := 'Driver telah tiba dan memulai proses towing.';
        receiver_user_id := NEW.customer_id;
      WHEN 'completed' THEN
        message_content := 'Layanan towing telah selesai. Terima kasih telah menggunakan layanan kami!';
        receiver_user_id := NEW.customer_id;
      WHEN 'cancelled' THEN
        message_content := 'Permintaan towing telah dibatalkan.';
        receiver_user_id := CASE WHEN NEW.driver_id IS NOT NULL THEN NEW.driver_id ELSE NEW.customer_id END;
      ELSE
        message_content := NULL;
    END CASE;

    -- Insert system message if we have content
    IF message_content IS NOT NULL AND receiver_user_id IS NOT NULL THEN
      INSERT INTO chat_messages (
        tow_request_id,
        sender_id,
        receiver_id,
        message_type,
        content,
        metadata
      ) VALUES (
        NEW.id,
        '00000000-0000-0000-0000-000000000000', -- System user ID
        receiver_user_id,
        'system',
        message_content,
        jsonb_build_object('status_change', jsonb_build_object('from', OLD.status, 'to', NEW.status))
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ language 'plpgsql';

-- 10. Create trigger for automatic system messages
CREATE TRIGGER send_system_message_on_tow_request_status_change
  AFTER UPDATE ON tow_requests
  FOR EACH ROW
  EXECUTE FUNCTION send_system_message_on_status_change();

-- 11. Create function to mark messages as read
CREATE OR REPLACE FUNCTION mark_messages_as_read(request_id TEXT, user_id UUID)
RETURNS INTEGER AS $
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE chat_messages 
  SET is_read = true, read_at = now()
  WHERE tow_request_id = request_id 
    AND receiver_id = user_id 
    AND is_read = false;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$ language 'plpgsql';

-- 12. Create function to get unread message count
CREATE OR REPLACE FUNCTION get_unread_message_count(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unread_count
  FROM chat_messages
  WHERE receiver_id = user_id AND is_read = false;
  
  RETURN unread_count;
END;
$$ language 'plpgsql';

-- 13. Create view for chat conversations with latest message
CREATE OR REPLACE VIEW chat_conversations AS
SELECT DISTINCT
  cm.tow_request_id,
  tr.customer_id,
  tr.driver_id,
  tr.status as request_status,
  tr.service_type,
  tr.pickup_location,
  tr.dropoff_location,
  tr.vehicle_info,
  (
    SELECT content
    FROM chat_messages cm2
    WHERE cm2.tow_request_id = cm.tow_request_id
    ORDER BY cm2.created_at DESC
    LIMIT 1
  ) as last_message,
  (
    SELECT created_at
    FROM chat_messages cm2
    WHERE cm2.tow_request_id = cm.tow_request_id
    ORDER BY cm2.created_at DESC
    LIMIT 1
  ) as last_message_at,
  (
    SELECT COUNT(*)
    FROM chat_messages cm2
    WHERE cm2.tow_request_id = cm.tow_request_id
      AND cm2.receiver_id = auth.uid()
      AND cm2.is_read = false
  ) as unread_count
FROM chat_messages cm
JOIN tow_requests tr ON tr.id = cm.tow_request_id
WHERE auth.uid() = tr.customer_id OR auth.uid() = tr.driver_id;

-- 14. Grant necessary permissions
GRANT ALL ON tow_requests TO authenticated;
GRANT ALL ON chat_messages TO authenticated;
GRANT SELECT ON chat_conversations TO authenticated;
GRANT EXECUTE ON FUNCTION mark_messages_as_read(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_message_count(UUID) TO authenticated;

-- 15. Create realtime publication for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE tow_requests;