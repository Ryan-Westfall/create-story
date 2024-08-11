import {Composition} from 'remotion';
import {CaptionedVideo} from './CaptionedVideo';
import transcript from '../public/audio/audio.json';
import {ChakraProvider} from '@chakra-ui/react';

export const RemotionRoot: React.FC = () => {
	const compositionDurationInFrames =
		Math.ceil(
			transcript.transcription[transcript.transcription.length - 1]
				.startInSeconds * 30,
		) + 40;

	return (
		<ChakraProvider>
			<Composition
				id="CaptionedVideo"
				component={CaptionedVideo}
				fps={30}
				width={1080}
				height={1920}
				durationInFrames={compositionDurationInFrames}
			/>
		</ChakraProvider>
	);
};
