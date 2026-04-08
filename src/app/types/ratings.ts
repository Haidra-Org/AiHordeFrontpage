export interface DatasetImagePopResponse {
  id: string;
  url: string;
  dataset_id: string;
}

export interface RatePostInput {
  rating: number;
  artifacts: number;
}

export interface RatePostResponse {
  message: string;
  reward: number;
}
