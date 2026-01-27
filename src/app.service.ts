import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrlBase: string;

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get<string>('R2_BUCKET_NAME');
    this.publicUrlBase = this.configService.get<string>('R2_PUBLIC_URL');

    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );
    // Initialize the S3 Client for Cloudflare R2
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });
  }

  async getVideos() {
    try {
      // 1. List all files in the bucket (you can add { Prefix: 'movies/' } to filter by folder)
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: 'movies/',
      });

      const listResponse = await this.s3Client.send(listCommand);

      if (!listResponse.Contents) {
        return [];
      }

      // 2. Filter for video files only (simple check)
      const videoFiles = listResponse.Contents.filter(
        (file) =>
          file.Key && (file.Key.endsWith('.mp4') || file.Key.endsWith('.mkv')),
      );

      // 3. Fetch metadata for each file (Parallel requests)
      const videosWithMetadata = await Promise.all(
        videoFiles.map(async (file) => {
          // Get the specific details (Metadata) for this file
          const headCommand = new HeadObjectCommand({
            Bucket: this.bucketName,
            Key: file.Key,
          });

          const headResponse = await this.s3Client.send(headCommand);
          const baseName = this.getBaseName(file.Key!);
          const subtitleUrl = await this.findMatchingSubtitle(baseName);

          console.log('subtitleUrl', subtitleUrl);

          // R2 returns metadata keys in lowercase
          const title = headResponse.Metadata?.title || file.Key; // Fallback to filename if no title

          return {
            filename: file.Key,
            url: `${this.publicUrlBase}/${file.Key}`,
            subtitleUrl,
            title: title,
            size: file.Size,
          };
        }),
      );
      console.log('videosWithMetadata', videosWithMetadata);
      return videosWithMetadata;
    } catch (error) {
      this.logger.error('Error fetching videos from R2', error);
      throw error;
    }
  }

  private getBaseName(key: string): string {
    const file = key.split('/').pop() || key;
    return file.replace(/\.[^/.]+$/, '');
  }

  private async findMatchingSubtitle(baseName: string): Promise<string | null> {
    const subtitleKey = `subtitles/${baseName}.vtt`;
    try {
      await this.s3Client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: subtitleKey }),
      );
      return `${this.publicUrlBase}/${subtitleKey}`;
    } catch {
      return null;
    }
  }
}
