package destination

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// s3Putter is the subset of *s3.Client used by s3Deliver.
// Defined as an interface so tests can inject a fake without hitting AWS.
type s3Putter interface {
	PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error)
}

// s3BucketChecker is the subset of *s3.Client used by testS3 in the testhandler.
type s3BucketChecker interface {
	HeadBucket(ctx context.Context, params *s3.HeadBucketInput, optFns ...func(*s3.Options)) (*s3.HeadBucketOutput, error)
}

// newS3Putter builds a real *s3.Client from config. Replaced in tests.
var newS3Putter = func(cfg aws.Config) s3Putter {
	return s3.NewFromConfig(cfg)
}

func s3Deliver(ctx context.Context, config map[string]any, event map[string]any) error {
	awsCfg, bucket, err := buildAWSConfig(config)
	if err != nil {
		return err
	}

	prefix, _ := config["prefix"].(string)
	if prefix == "" {
		prefix = "flowmesh-events"
	}

	eventID, _ := event["eventId"].(string)
	if eventID == "" {
		eventID = fmt.Sprintf("unknown-%d", time.Now().UnixNano())
	}

	now := time.Now().UTC()
	key := fmt.Sprintf("%s/%04d/%02d/%02d/%s.json",
		prefix, now.Year(), int(now.Month()), now.Day(), eventID)

	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	client := newS3Putter(awsCfg)
	_, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(body),
		ContentType: aws.String("application/json"),
	})
	if err != nil {
		return fmt.Errorf("s3 put object: %w", err)
	}

	return nil
}

// buildAWSConfig validates the destination config and returns an aws.Config
// and the bucket name. Used by both the delivery driver and the test handler.
func buildAWSConfig(config map[string]any) (aws.Config, string, error) {
	bucket, ok := config["bucket"].(string)
	if !ok || bucket == "" {
		return aws.Config{}, "", fmt.Errorf("s3 config missing bucket")
	}

	region, ok := config["region"].(string)
	if !ok || region == "" {
		return aws.Config{}, "", fmt.Errorf("s3 config missing region")
	}

	accessKeyID, ok := config["accessKeyId"].(string)
	if !ok || accessKeyID == "" {
		return aws.Config{}, "", fmt.Errorf("s3 config missing accessKeyId")
	}

	secretAccessKey, ok := config["secretAccessKey"].(string)
	if !ok || secretAccessKey == "" {
		return aws.Config{}, "", fmt.Errorf("s3 config missing secretAccessKey")
	}

	creds := credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, "")
	cfg := aws.Config{
		Region:      region,
		Credentials: creds,
	}

	return cfg, bucket, nil
}
