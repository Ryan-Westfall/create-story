/* eslint-disable camelcase */
import axios from 'axios';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import {execSync} from 'child_process';
import path from 'path';
import OpenAI from 'openai';
import dotenv from "dotenv";
import { renderMedia, selectComposition} from "@remotion/renderer";
import { bundle } from "@remotion/bundler";
import {
	convertToCaptions,
	downloadWhisperModel,
	installWhisperCpp,
	transcribe,
} from '@remotion/install-whisper-cpp';
import puppeteer from 'puppeteer';

dotenv.config();

const inputPrompt = `
Create a reddit like story in the 1st person that has a good hook and is overall entertaining to listen to. Make it from the point of view of a man. Try to make it a bit controversial. 
Try to pose a question at the end of the story if the right action was taken place. Avoid abbreviations. 
Look at the length and content of Reddit's AmITheAsshole subreddit. I want this story to be 250 words long. Make the content without line breaks.
Add 10 tags.

Fill in the story to fit in this json format:
{
  "title": "",
  "content": "",
  "tags": []
}
`;

type Story = {
	title: string;
	content: string;
	tags: string[];
};

const generateStory = async () => {
	const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
	console.log('Calling ChatGPT');
	const completion = await openai.chat.completions.create({
		messages: [{role: 'system', content: inputPrompt}],
		model: 'gpt-4o',
	});
	console.log("Returned:  \n", completion.choices[0].message.content!);

	try {
        await fs.writeFileSync('annotate.json', completion.choices[0].message.content!);
        console.log('Success: Writing to file annotate.json');
    } catch (error) {
        console.error('Error writing to file:', error);
		process.exit(1)
    }
};

const ttsRequest = async () => {
	const fileContent = fs.readFileSync('annotate.json', 'utf8');
	const story: Story = JSON.parse(fileContent);
	
	const textAnnotate = story.title + '. ' + story.content;
	const voiceAdam = 'pNInz6obpgDQGcFmaJgB';

	try {
		const response = await axios({
			method: 'post',
			url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceAdam}`,
			headers: {
				Accept: 'audio/mpeg',
				'Content-Type': 'application/json',
				'xi-api-key': process.env.ELEVEN_LABS_API_KEY,
			},
			responseType: 'stream',
			data: {
				text: textAnnotate,
				model_id: 'eleven_monolingual_v1',
				voice_settings: {
					stability: 0.5,
					similarity_boost: 0.5,
				},
			},
		});

		const writeFilePromise = new Promise<void>((resolve, reject) => {
			const writer = fs.createWriteStream('output.mp3');
			
			response.data.pipe(writer);
	
			writer.on('finish', () => {
			console.log('MP3 file saved successfully!');
			resolve();
			});
	
			writer.on('error', (err) => {
			console.error('Error writing the MP3 file:', err);
			reject(err);
			});
		});
	
		// Wait for the file to be fully written
		await writeFilePromise;
  
	} catch (error) {
	  console.error('Error during the API call:', error);
	}
};

const processAudio = async () => {
	//Step 1 Get duration of Audio
	let durationInSeconds;
		try {
			durationInSeconds = parseFloat(
				execSync(
					`ffprobe -i output.mp3 -show_entries format=duration -v quiet -of csv="p=0"`,
					{encoding: 'utf-8'},
				),
			);
		} catch (error) {
			console.log("Getting duration went wrong", error);
			throw error;
		}
	console.log('Duration of inital file: ', durationInSeconds);

	//Step 2 Speed up if needed
	if (durationInSeconds < 58) {
		console.log('File does not need sped up.');
		await execSync(`mv output.mp3 audio.mp3`);
		await execSync(`mv audio.mp3 public/audio`);
	} else {
		const speedFactor = durationInSeconds / 58;
		console.log("Speeding up by factor: ", speedFactor);
		await new Promise<void>((resolve, reject) => {
			ffmpeg("output.mp3")
				.audioFilter(`atempo=${speedFactor}`)
				.on('error', (err) => {
					reject(err);
				})
				.on('end', () => {
					console.log("Successfully sped up audio.")
					fs.rmSync(path.join(process.cwd(), 'output.mp3'), {recursive: true});
					resolve();
				})
				.saveToFile("public/audio/audio.mp3")
		})
	}
}

const createTranscription = async () => {
	console.log("Creating Transcription")
	await installWhisperCpp({to: path.join(process.cwd(), 'whisper.cpp'), version: '48a145'});
	await downloadWhisperModel({folder: path.join(process.cwd(), 'whisper.cpp'), model: 'small.en'});
	await execSync(
		`ffmpeg -i public/audio/audio.mp3 -ar 16000 temp.wav -y`,
		{stdio: ['ignore', 'inherit']},
	);

	let retries = 3;
	let attempt = 0;
	let result;
	while(attempt < retries) {
		try {
			result = await transcribe({
				inputPath: path.join(process.cwd(),'temp.wav'),
				model: 'small.en',
				tokenLevelTimestamps: true,
				whisperPath: path.join(process.cwd(), 'whisper.cpp'),
				translateToEnglish: false,
			});
			attempt = attempt + 5
		} catch(error) {
			attempt++;
			console.log("Attempt on transcribe: ", attempt)
			if(attempt >= retries) {
				throw error;
			}
		}
	}

	const {captions} = convertToCaptions({
		transcription: result!.transcription,
		combineTokensWithinMilliseconds: 300,
	});
	await fs.writeFileSync(path.join(process.cwd(),'public/audio','audio.json'),
		JSON.stringify(
			{
				...result,
				transcription: captions,
			},
			null,
			2,
		),
	);
	fs.rmSync(path.join(process.cwd(), 'temp.wav'));
	console.log("Finished Transcription")
};

const createVideo = async () => {
	console.log("Creating Remotion Video Elements")
	const compositionId = "CaptionedVideo"
	const bundleLocation = await bundle({
		entryPoint: path.resolve("./src/index.ts"),
	});
	const composition = await selectComposition({
		serveUrl: bundleLocation,
		id: compositionId,
	});

	let lastSeen = 0;
	await renderMedia({
		composition,
		serveUrl: bundleLocation,
		codec: "h264",
		outputLocation: `out/${compositionId}.mp4`,
		onProgress: ({progress}) => {
			const progressPercent = progress * 100
			if((progressPercent) % 5 === 0 && lastSeen !== progressPercent) {
				console.log(`Rendering is ${progressPercent}% complete`);
				lastSeen = progressPercent
			}
		}
	});

	console.log("Successfully Created Video Elements")
}

const uploadVideos = async () => {
	const fileContent = fs.readFileSync('annotate.json', 'utf8');
	const story: Story = JSON.parse(fileContent);
  
	const browser = await puppeteer.launch({ headless: true});
	const page = await browser.newPage();
	await page.goto('https://publish.buffer.com/calendar/week');
	await page.setViewport({ width: 1920, height: 1080 });
  
	try {
		//Step 1: Login
		await page.waitForSelector('#email');
		await page.type('#email', 'thestorytellingbard@proton.me'); 
		await page.type('#password', 'Storytellingbard1!');
		await page.click('#login-form-submit');
	 
		//Step 2: Close Modals
		while (true) {
			try {
				const closeButton = 'button[aria-label="Close"]';
				await page.waitForSelector(closeButton, {timeout: 5000})
				console.log('Modal detected, closing it...');
				await page.click(closeButton);
				await page.evaluate(() => {
					return new Promise(resolve => {
					setTimeout(resolve, 1000);
					});
				});
			}
			catch (err) {
				break;
			}
		}
	  
		//Step 3: Go to upload page
		const buttonSelector = 'button[aria-controls="composer-root"]';
		await page.waitForSelector(buttonSelector);
		await page.evaluate(() => {
		return new Promise(resolve => {
			setTimeout(resolve, 2000);
		});
		});
		await page.click(buttonSelector);
		await page.waitForSelector('button[name="youtube-profile-button"]');
		// await page.click('button[name="youtube-profile-button"]');
		// await page.click('button[name="tiktok-profile-button"]');
		// await page.click('button[name="instagram-profile-button"]');
 
		//Step 4: Upload video
		const uploadButtonSelector = '[data-testid="composer-uploader-dropzone"]';
		await page.waitForSelector(uploadButtonSelector);
		const [fileChooser] = await Promise.all([
			page.waitForFileChooser(),
			page.click(uploadButtonSelector),
			]);
		const filePath = '/Users/ryrywest/Documents/SereneBean/create-story/out/CaptionedVideo.mp4'; 
		await fileChooser.accept([filePath]);

		//Step 5: Input video data
		const selectBodyInput = 'div[data-testid="composer-text-area"]'
		await page.waitForSelector(selectBodyInput, { visible: true });
		await page.click(selectBodyInput);
		await page.type(selectBodyInput, story.title + "\n\n" + story.tags.map(tag => '#' + tag.replace(/\s+/g, '_')).join(' '));
		await page.evaluate(() => {
			return new Promise(resolve => {
			setTimeout(resolve, 90000);
			});
		});
		await page.click('button[data-testid="omnibox-buttons"]');

		//Step 6: Add YouTube data
		const elementSelector = 'div.publish_youtubeIcon_X9DGY.publish_socialNetworkIcon_nlofG';
		await page.waitForSelector(elementSelector, { visible: true });
		await page.click(elementSelector);
	
		const inputSelector = 'input[type="text"][aria-label="Video title"].publish_input_CHPY-';
		await page.waitForSelector(inputSelector, { visible: true });
		await page.click(inputSelector);
		await page.type(inputSelector, story.title);
	
		const cssSelector = 'button[data-testid="stacked-save-buttons"]';
		await page.waitForSelector(cssSelector, { visible: true });
		await page.click(cssSelector);

		await page.evaluate(() => {
			return new Promise(resolve => {
			setTimeout(resolve, 90000);
			});
		});
	
		} catch (error) {
		console.error('Error:', error);
		} finally {
		await browser.close();
		}
	
  }

const main = async () => {
	await generateStory();
	await ttsRequest();
	await processAudio()
	await createTranscription()
	await createVideo();
	await uploadVideos();
};

main();