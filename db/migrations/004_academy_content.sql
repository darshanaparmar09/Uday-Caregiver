-- Starter academy content. Clinical content must be reviewed by Uday's clinical advisor before use.
INSERT INTO academy_modules (id, tier, ord, title, minutes, lesson, quiz) VALUES
('t1-dignity', 1, 1, 'Dignity and respect', 10,
 ARRAY['Address elders the way the family asks, for example Aaji or Kaka.','Ask before you help. Explain what you are about to do.','Keep the person covered during bathing and dressing.','Never discuss the family''s private matters with anyone.'],
 '[{"q":"Before helping someone dress, you should","options":["Start quickly to save time","Ask and explain first","Wait for the family"],"answer":1},{"q":"Family matters you hear at work are","options":["Private","Fine to share with other caregivers","Fine to post online"],"answer":0},{"q":"During bathing, keep the person","options":["Uncovered for speed","Covered as much as possible","Alone in the room"],"answer":1}]'),
('t1-falls', 1, 2, 'Preventing falls', 12,
 ARRAY['Keep floors dry and walkways clear.','Use night lights on the way to the bathroom.','Let the person stand slowly and sit first if dizzy.','If a fall happens, do not lift alone. Check for injury, call the family and Uday, call 112 if hurt.'],
 '[{"q":"After a fall, first you should","options":["Lift them up at once","Check for injury and call for help","Give them water"],"answer":1},{"q":"If someone feels dizzy when standing, they should","options":["Walk faster","Sit down first","Hold the wall and continue"],"answer":1},{"q":"At night the path to the bathroom needs","options":["A night light","Rugs","Closed doors"],"answer":0}]'),
('t1-safety', 1, 3, 'Safety, SOS and money rules', 8,
 ARRAY['Never handle cash, cards, jewellery or property papers.','Use the SOS button if you feel unsafe or there is an emergency. Call 112 if anyone is in danger.','Only enter with the family''s start code. Always close a shift with the end code.'],
 '[{"q":"If the family asks you to fetch cash from the ATM","options":["Do it","Politely refuse and tell Uday","Ask for a tip"],"answer":1},{"q":"If you feel unsafe in a home","options":["Use SOS","Stay quiet","Leave without telling anyone"],"answer":0},{"q":"A shift starts when","options":["You arrive","The family gives the start code","The family pays"],"answer":1}]'),
('t2-transfers', 2, 4, 'Safe transfers and mobility', 15,
 ARRAY['Bend your knees, keep your back straight, keep the person close.','Lock wheelchair brakes before every transfer.','Use a transfer belt where provided.'],
 '[{"q":"Before a wheelchair transfer","options":["Lock the brakes","Remove the footrests only","Tilt the chair"],"answer":0},{"q":"When lifting, keep your back","options":["Bent","Straight","Twisted"],"answer":1},{"q":"Keep the person","options":["Close to your body","At arm''s length","Behind you"],"answer":0}]'),
('t2-dementia', 2, 5, 'Dementia care basics', 15,
 ARRAY['Speak slowly, one idea at a time.','Do not argue about facts; redirect gently.','Keep the daily routine the family describes.'],
 '[{"q":"If a person with dementia insists it is a different year","options":["Correct them firmly","Redirect gently","Ignore them"],"answer":1},{"q":"Instructions should be","options":["One step at a time","All at once","Written only"],"answer":0},{"q":"The daily routine should be","options":["Changed often","Kept steady","Decided by you"],"answer":1}]'),
('t3-medication', 3, 6, 'Medication and vitals records', 15,
 ARRAY['Give only medicines listed in the care profile, at the listed time.','Record every dose in the shift log.','Report readings outside the doctor''s range to the family and Uday at once.'],
 '[{"q":"A medicine not in the care profile","options":["Give it if the family asks verbally","Do not give it; ask the family to update the profile","Give half"],"answer":1},{"q":"Every dose must be","options":["Recorded in the shift log","Remembered","Told to the neighbour"],"answer":0},{"q":"An abnormal reading should be","options":["Reported at once","Noted for tomorrow","Ignored"],"answer":0}]')
ON CONFLICT (id) DO NOTHING;
