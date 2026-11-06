// Everyday words the big word lists don't have, added to the dictionary by
// scripts/build-words.mjs (it's only read there, not at run time). Lowercase, letters only:
// contractions are written without the apostrophe, the way people type them in a game.
export const EXTRA = `
im id ive youve weve theyve youre theyre were hes shes its whos whats wheres whens whys hows thats theres heres
dont doesnt didnt cant couldnt wont wouldnt shouldnt isnt arent wasnt werent hasnt havent hadnt mustnt neednt mightnt
aint yall yallre ill youll hell shell well theyll itll thatll youd hed shed wed theyd itd lets oclock
gonna wanna gotta lemme gimme kinda sorta dunno outta lotta ya yea yeah yep yup nope nah ok okay okey kk
hi hey heya hiya yo sup wassup howdy bye byebye cya ttyl brb lol lmao rofl omg idk idc imo tbh btw fyi smh irl jk np ty thx pls plz bff bffs
rizz rizzed rizzler yeet yeeted sus sussy bussin cap nocap bet slay slayed slaying periodt lowkey highkey vibe vibes vibing
bestie besties fam bruh bro bros brah dude dudes sis cringe cringey cringy salty savage stan stans simp simps noob noobs newb
goat goated drip drippy flex flexing glowup ghosted ghosting delulu sigma skibidi mewing ratio ratioed rent fr ong
meme memes memer emoji emojis emoticon selfie selfies vlog vlogs vlogger vloggers vlogging blog blogger podcast podcasts
youtube youtuber youtubers tiktok tiktoker tiktokers tiktoks instagram snapchat snapchats snapstreak whatsapp facebook twitter tweet tweets tweeted retweet
reddit discord twitch streamer streamers livestream livestreams livestreaming google googled googling netflix spotify hulu disney pixar amazon apple
iphone iphones ipad ipads ipod imac macbook airpods android androids chromebook chromebooks laptop laptops smartphone smartphones smartwatch
wifi bluetooth usb hdmi app apps webcam webcams website websites webpage webpages homepage username usernames password passwords login logout signup
online offline email emails emailed emailing texting texted ai chatbot chatbots chatgpt robot robots hacker hackers hacked malware spyware
bitcoin bitcoins crypto cryptos blockchain nft nfts esports esport gamer gamers gaming console consoles controller joystick headset headsets
minecraft roblox fortnite pokemon pikachu mario zelda sonic tetris pacman nintendo playstation xbox xboxes steam valorant overwatch
lego legos barbie hotwheels nerf frisbee pokeball
covid coronavirus vax vaxxed
pizza pizzas burrito burritos taco tacos nachos quesadilla quesadillas sushi ramen boba pho bbq barbecue hotdog hotdogs cheeseburger cheeseburgers
smoothie smoothies frappuccino starbucks mcdonalds chipotle doritos cheetos oreo oreos nutella skittles takis gatorade
tshirt tshirts hoodie hoodies sneakers crocs jorts
kpop kdrama anime manga otaku cosplay cosplayer
mom moms mommy dad dads daddy grandma grandmas grandpa grandpas nana papa auntie aunties
`
  .split(/\s+/)
  .filter(Boolean);
