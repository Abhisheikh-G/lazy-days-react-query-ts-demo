import jsonpatch from 'fast-json-patch';
import { UseMutateFunction, useMutation, useQueryClient } from 'react-query';

import type { User } from '../../../../../shared/types';
import { axiosInstance, getJWTHeader } from '../../../axiosInstance';
import { queryKeys } from '../../../react-query/constants';
import { useCustomToast } from '../../app/hooks/useCustomToast';
import { useUser } from './useUser';

async function patchUserOnServer(
  newData: User | null,
  originalData: User | null,
): Promise<User | null> {
  if (!newData || !originalData) return null;
  // create a patch for the difference between newData and originalData
  const patch = jsonpatch.compare(originalData, newData);

  // send patched data to the server
  const { data } = await axiosInstance.patch(
    `/user/${originalData.id}`,
    { patch },
    {
      headers: getJWTHeader(originalData),
    },
  );
  return data.user;
}

// TODO: update type to UseMutateFunction type
export function usePatchUser(): UseMutateFunction<
  User,
  unknown,
  User,
  unknown
> {
  const queryClient = useQueryClient();
  const { user, updateUser } = useUser();
  const toast = useCustomToast();
  const { mutate: patchUser } = useMutation(
    (newUserData: User) => patchUserOnServer(newUserData, user),
    {
      onMutate: async (newData: User | null) => {
        // cancel outgoing queries
        queryClient.cancelQueries(queryKeys.user);
        // snapshot of previous user value
        const previousUserData: User = queryClient.getQueryData(queryKeys.user);
        // optimistically update cache
        updateUser(newData);
        // return context
        return { previousUserData };
      },
      onError: (error, newData, context) => {
        // rollback cache to previous value
        if (context.previousUserData) {
          updateUser(context.previousUserData);
          toast({
            title: 'Updated failed; restoring previous values',
            status: 'warning',
          });
        }
      },
      onSuccess: (userData: User | null) => {
        updateUser(userData);
        toast({
          title: 'User updated',
          status: 'success',
        });
      },
      onSettled: () => {
        // invalidate user query to sync with server
        queryClient.invalidateQueries(queryKeys.user);
      },
    },
  );

  return patchUser;
}
