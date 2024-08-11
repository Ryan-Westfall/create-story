import {useCallback, useEffect, useState} from 'react';
import {
	AbsoluteFill,
	cancelRender,
	continueRender,
	delayRender,
	getStaticFiles,
	OffthreadVideo,
	Sequence,
	useVideoConfig,
	watchStaticFile,
	Audio,
	staticFile,
	random,
} from 'remotion';
import Subtitle from './Subtitle';
import {loadFont} from '../load-font';
import {NoCaptionFile} from './NoCaptionFile';
import {Text, Flex, Avatar, Heading, Box, Icon, Image} from '@chakra-ui/react';
import {FaThumbsUp, FaRegComment, FaShare} from 'react-icons/fa';
import annotate from '../../annotate.json';
import {getVideoMetadata} from '@remotion/media-utils';

export type SubtitleProp = {
	startInSeconds: number;
	text: string;
};

const getFileExists = (file: string) => {
	const files = getStaticFiles();
	const fileExists = files.find((f) => {
		return f.src === file;
	});
	return Boolean(fileExists);
};

export const CaptionedVideo: React.FC = () => {
	const [videoLength, setData] = useState(4000);
	useEffect(() => {
		const getLengthVideo = async () => {
			const metadata = await getVideoMetadata(staticFile('video.mp4'));
			setData(metadata.durationInSeconds);
		};
		getLengthVideo();
	}, []);

	const audio = staticFile('/audio/audio.mp3');
	const subtitlesFile = staticFile('audio/audio.json');
	const [subtitles, setSubtitles] = useState<SubtitleProp[]>([]);
	const [titleDuration, setTitleDuration] = useState<number>(120);
	const [handle] = useState(() => delayRender());
	const {fps, durationInFrames} = useVideoConfig();
	const randomNumber =
		random(annotate.title) * (videoLength * 30 - durationInFrames);

	const fetchSubtitles = useCallback(async () => {
		try {
			await loadFont();
			const res = await fetch(subtitlesFile);
			const data = await res.json();
			const subtitles: SubtitleProp[] = data.transcription;
			const subtitleIndex = subtitles.findIndex((subtitle) => {
				const titleWords = annotate.title.split(' ');
				const formatted = subtitle.text.replace(/[^\w\s]/g, '').toLowerCase();
				const result = formatted.includes(
					titleWords[titleWords.length - 1]
						.replace(/[^\w\s]/g, '')
						.toLowerCase(),
				);
				console.log(formatted, result);
				return result;
			});
			setSubtitles(subtitles.slice(subtitleIndex + 1));
			setTitleDuration(subtitles[subtitleIndex + 1].startInSeconds * fps);

			continueRender(handle);
		} catch (e) {
			cancelRender(e);
		}
	}, [handle, subtitlesFile]);

	useEffect(() => {
		fetchSubtitles();

		const c = watchStaticFile(subtitlesFile, () => {
			fetchSubtitles();
		});

		return () => {
			c.cancel();
		};
	}, [fetchSubtitles, staticFile('video.mp4'), subtitlesFile]);

	return (
		<>
			<div style={{height: '1920px'}}>
				<OffthreadVideo
					muted
					startFrom={randomNumber}
					endAt={durationInFrames + randomNumber + 100}
					src={staticFile('video.mp4')}
					style={{
						width: '100%',
						height: '100%',
						objectFit: 'cover',
					}}
				/>
			</div>
			<AbsoluteFill>
				<Audio src={audio} />
				<Sequence durationInFrames={titleDuration}>
					<AbsoluteFill
						style={{
							justifyContent: 'center',
							alignItems: 'center',
							zIndex: '100',
							top: '-100px',
						}}
					>
						<Box
							background="white"
							borderRadius="10"
							width="80%"
							padding="20px"
						>
							<Flex
								flex="5"
								gap="5"
								alignItems="center"
								flexWrap="wrap"
								paddingBottom="15px"
							>
								<Avatar size="xl" name="Bard" src={staticFile('avatar.jpg')} />
								<Flex gap="2">
									<Heading size="2xl">The Storytelling Bard</Heading>
									<Image
										src={staticFile('verified.png')}
										alt="Dan Abramov"
										boxSize="50px"
									/>
								</Flex>
							</Flex>

							<Text fontSize="5xl" as="b">
								{annotate.title}
							</Text>

							<Flex
								minWidth="max-content"
								alignItems="center"
								gap="10"
								paddingTop="20px"
							>
								<Flex minWidth="max-content" alignItems="center" gap="3">
									<Icon as={FaThumbsUp} boxSize={10} />
									<Text fontSize="4xl">{' 99+ '}</Text>
								</Flex>

								<Flex minWidth="max-content" alignItems="center" gap="3">
									<Icon as={FaRegComment} boxSize={10} />
									<Text fontSize="4xl">{' 99+ '}</Text>
								</Flex>

								<Flex minWidth="max-content" alignItems="center" gap="3">
									<Icon as={FaShare} boxSize={10} />
									<Text fontSize="4xl">{' 99+ '}</Text>
								</Flex>
							</Flex>
						</Box>
					</AbsoluteFill>
				</Sequence>

				{subtitles.map((subtitle, index) => {
					const nextSubtitle = subtitles[index + 1] ?? null;
					const subtitleStartFrame = subtitle.startInSeconds * fps;
					const subtitleEndFrame = Math.min(
						nextSubtitle ? nextSubtitle.startInSeconds * fps : Infinity,
						subtitleStartFrame + fps,
					);
					const durationInFrames = subtitleEndFrame - subtitleStartFrame;
					if (durationInFrames <= 0) {
						return null;
					}

					return (
						<Sequence
							from={subtitleStartFrame}
							durationInFrames={durationInFrames}
						>
							<Subtitle key={index} text={subtitle.text} />;
						</Sequence>
					);
				})}
				{getFileExists(subtitlesFile) ? null : <NoCaptionFile />}
			</AbsoluteFill>
		</>
	);
};
